#!/usr/bin/env node

import type { TpMatchEmbeddedPlayer } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { TpCoachesImportService } from './coaches/tp-coaches-import.service';
import { TpCompetitionIdResolverService } from './competitions/tp-competition-id-resolver.service';
import { TpCompetitionSourcesService } from './competitions/tp-competition-sources.service';
import { TpCompetitionsImportService } from './competitions/tp-competitions-import.service';
import { TpErasImportService } from './eras/tp-eras-import.service';
import { TpLeaguesImportService } from './leagues/tp-leagues-import.service';
import { TpMatchFilesImportService } from './match-files/tp-match-files-import.service';
import { TpOfficialTeamsFilesImportService } from './official-teams/tp-official-teams-files-import.service';
import { TpOfficialTeamsTimingReportService } from './official-teams/tp-official-teams-timing-report.service';
import { TpLastingInjuryBackfillImportService } from './players/tp-lasting-injury-backfill-import.service';
import { TpSppAdjustmentsImportService } from './players/tp-spp-adjustments-import.service';
import {
  type FreshestMatchEntries,
  TpMatchEmbeddedPlayerFreshnessService,
} from './rosters/tp-match-embedded-player-freshness.service';
import { TpRosterFilesImportService } from './rosters/tp-roster-files-import.service';
import { TpRosterPlayerFactsService } from './rosters/tp-roster-player-facts.service';
import { TpRulesSetsImportService } from './rules-sets/tp-rules-sets-import.service';
import { OfficialTeamsCollectionService } from './source/official-teams-collection.service';
import { RosterCollectionService } from './source/roster-collection.service';
import { SkillMasterNameCollectionService } from './source/skill-master-name-collection.service';
import { TpMissingTrophyAwardsImportService } from './trophy-awards/tp-missing-trophy-awards-import.service';

async function run(): Promise<ImportResult> {
  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    // Bootstrap order still matters: the league and rule sets must be
    // upserted before eras, which resolve both server-side, by external id,
    // against whatever these two prior steps just wrote.
    const leagueOutcome = await app.get(TpLeaguesImportService).importLeague();
    const rulesSetsOutcome = await app
      .get(TpRulesSetsImportService)
      .importRulesSets();
    const eraOutcome = await app.get(TpErasImportService).importEras();

    // Every competition directory is scanned once, up front: its tournament,
    // its era and its parsed matches feed the match-snapshot pass below, long
    // before the competitions themselves are imported (after the rosters,
    // further down). Nothing is upserted here.
    const competitionSources = await app
      .get(TpCompetitionSourcesService)
      .collect();

    const coachOutcome = await app.get(TpCoachesImportService).importCoaches();

    // Roster files (rosters_<id>.json) are scanned and parsed once here, then
    // shared by the roster import, the competition import and the roster
    // player facts below, so a bad file is reported once.
    const rosterErrors: ImportError[] = [];
    const rosters = await app
      .get(RosterCollectionService)
      .collect(rosterErrors);
    const rosterCollectionResult = app.get(ImportResultService).result({
      imported: 0,
      errors: rosterErrors,
    });

    // TP's official team list (races, positions, star players with their
    // characteristics) is scanned and parsed once here, then sent to the
    // server by the official team list import below -- the canonical
    // per-rules-set source, independent of which rosters happened to be
    // played.
    const officialTeamsErrors: ImportError[] = [];
    const officialTeams = await app
      .get(OfficialTeamsCollectionService)
      .collect(officialTeamsErrors);
    const officialTeamsCollectionResult = app.get(ImportResultService).result({
      imported: 0,
      errors: officialTeamsErrors,
    });

    // The skillMasterId -> name lookup is scanned once here, from the same
    // mirror the rosters/matches were read from: rosters_masters names skills
    // by id only, while every real roster and match embeds the name. It is
    // sent with the official team list below.
    const skillNameErrors: ImportError[] = [];
    const skillMastersByMasterId = await app
      .get(SkillMasterNameCollectionService)
      .collect(skillNameErrors);
    const skillNameCollectionResult = app.get(ImportResultService).result({
      imported: 0,
      errors: skillNameErrors,
    });

    // Each rules set's official team list goes to the server as several
    // tpOfficialTeams.import calls (chunks of whole races, shared stars
    // normalized first so chunk order cannot matter), which write its races,
    // positions and stars (with their race/era availability),
    // characteristics, keywords and starting skills. This runs in the same
    // TP importer invocation that writes position availability, which is a
    // separate (and later) invocation than the BBL importer's -- so for every
    // position both sources describe, TP's characteristics overwrite BBL's
    // (BBL only ever inserts these rows, so its re-runs leave TP's values
    // alone). That ordering is deliberate: TP's values are per-rules-set and
    // authoritative, where BBL's are a converted single snapshot. It runs
    // before the rosters, because players resolve their position against what
    // it upserts.
    const officialTeamsOutcome = await app
      .get(TpOfficialTeamsFilesImportService)
      .importOfficialTeams({ officialTeams, skillMastersByMasterId });

    // Printed right away, so a failure in a later step cannot lose it: how
    // long each official team list request took and where the server spent
    // that time, so a slow stage shows up without extra instrumentation.
    for (const line of app
      .get(TpOfficialTeamsTimingReportService)
      .summaryLines(officialTeamsOutcome.requestTimings)) {
      console.log(line);
    }

    // One pass over the parsed matches builds matchEmbeddedPlayersByRosterId:
    // a standalone rosters_<id>.json file only reflects a roster's CURRENT
    // composition as of when the local TP data mirror was downloaded, so a
    // player who has since left/been replaced is silently absent from it even
    // though historical matchEvents[] can still reference them. Each match's
    // own homeRosterPlayers/awayRosterPlayers (parsed from
    // inscriptionLocal/Visitor.roster.lineUps[]) embeds a per-match snapshot
    // of that side's roster, so accumulating them across every match a
    // roster played (deduped by player id) fills that gap.
    const matchEmbeddedPlayersByRosterIdMut = new Map<
      number,
      Map<number, FreshestMatchEntries>
    >();
    // An entry shows the player as of the download, not as of its match, so
    // the freshest entry is kept, and separately the freshest one that
    // carries an unspent figure (see TpMatchEmbeddedPlayerFreshnessService).
    const freshness = app.get(TpMatchEmbeddedPlayerFreshnessService);
    const accumulateMatchEmbeddedPlayers = (
      rosterId: number,
      players: TpMatchEmbeddedPlayer[],
    ) => {
      let byPlayerId = matchEmbeddedPlayersByRosterIdMut.get(rosterId);
      if (!byPlayerId) {
        byPlayerId = new Map<number, FreshestMatchEntries>();
        matchEmbeddedPlayersByRosterIdMut.set(rosterId, byPlayerId);
      }
      for (const player of players) {
        freshness.accumulate(byPlayerId, player);
      }
    };
    for (const matches of competitionSources.matchesByCompetitionTpId.values()) {
      for (const match of matches) {
        accumulateMatchEmbeddedPlayers(
          match.homeTeamTpId,
          match.homeRosterPlayers,
        );
        accumulateMatchEmbeddedPlayers(
          match.awayTeamTpId,
          match.awayRosterPlayers,
        );
      }
    }
    const matchEmbeddedPlayersByRosterId = new Map(
      Array.from(matchEmbeddedPlayersByRosterIdMut.entries()).map(
        ([rosterId, byPlayerId]) => [rosterId, freshness.entries(byPlayerId)],
      ),
    );

    // Each roster file goes to the server as-is (tpRosters.import), which
    // parses it and upserts its team, its players and their own skills; this
    // runs after positions because players resolve their position against what
    // the positions step just upserted. Each call also carries that roster's
    // match-snapshot-only players (matchEmbeddedPlayersByRosterId, above),
    // so a player who has since left a roster is still imported. The
    // returned ids are what every later step resolves teams and players by.
    const rosterImport = await app
      .get(TpRosterFilesImportService)
      .importRosterFiles({ rosters, matchEmbeddedPlayersByRosterId });
    const {
      playerIdsByLineUpId,
      insertedPlayerIds,
      reportedSppTotalsByPlayerId,
      unspentSppSnapshotsByPlayerId,
    } = rosterImport;

    // Career SPP counts come straight off the parsed roster files, keyed by
    // the DB ids the roster import returned.
    const { careerSppCountsByPlayerId } = app
      .get(TpRosterPlayerFactsService)
      .collect({ rosters, playerIdsByLineUpId });

    // Each competition goes to the server in one tpCompetitions.import call,
    // which upserts it, links every team registered to it (the roster files
    // under its directory, whether or not the team played) and records its
    // trophy awards. It runs after the roster import, because linking a team
    // and awarding it a trophy both need its team era, and before the match
    // files, whose import needs the competition to exist.
    const competitionOutcome = await app
      .get(TpCompetitionsImportService)
      .importCompetitions({
        competitionsByTpId: competitionSources.competitionsByTpId,
        matchesByCompetitionTpId: competitionSources.matchesByCompetitionTpId,
        rosters,
      });

    // Every imported competition's DB id is resolved once here, server-side
    // by external id (its TP id, stringified): one batched lookup for the
    // whole run, reused below to link each match file to its competition and
    // to scope the missing-trophy-awards pass. A resolve miss is recorded as
    // an ImportError by the service itself, not silently dropped.
    const { result: competitionIdResolutionResult, competitionIdsByTpId } =
      await app.get(TpCompetitionIdResolverService).resolveCompetitionIds({
        tpIds: competitionOutcome.importedTpIds,
        tpSystemId: competitionSources.tpSystemId,
      });

    // Each match file goes to the server as-is (tpMatches.import), which
    // classifies the match against its competition's bracket, upserts it,
    // imports the star players its teams hired, links its teams, imports its
    // events and resolves its outcome. It runs after the roster and
    // competition imports because the server resolves each match's teams and
    // players by the TP ids those steps wrote, and before the SPP and
    // lasting-injury passes, which read its match events and take its hired
    // star players' ids.
    const matchFilesOutcome = await app
      .get(TpMatchFilesImportService)
      .importMatchFiles({
        competitionsByTpId: competitionSources.competitionsByTpId,
        competitionIdsByTpId,
        matchesByCompetitionTpId: competitionSources.matchesByCompetitionTpId,
      });

    // Runs after the match-files step: the adjustment is the gap between
    // TP's own reported career total (returned by the roster import, which
    // leaves players.spp_total to this step) and what the player's events
    // explain -- the spp_value those events just wrote, PLUS an estimate of the SPP earned in
    // competitions still in progress that have not been imported, priced from
    // the career action counts the players step collected. Star players hired
    // via an inducements_roll carry no reported total, so the server skips
    // them and their adjustment stays NULL.
    const sppAdjustmentsOutcome = await app
      .get(TpSppAdjustmentsImportService)
      .importSppAdjustments({
        playerIds: [
          ...playerIdsByLineUpId.values(),
          ...matchFilesOutcome.hiredStarPlayerIds,
        ],
        careerCountsByPlayerId: careerSppCountsByPlayerId,
        reportedSppTotalsByPlayerId,
        unspentSppSnapshotsByPlayerId,
      });

    // Also runs after the match-files step, and for the same structural
    // reason: it recomputes each freshly-inserted player's accumulated
    // niggling injuries and stat reductions from the match events just
    // written, so it can manufacture the players_history versions a player
    // whose injury was healed before this run would otherwise never get.
    // Scoped to players this run INSERTED — an existing player already has
    // whatever history earlier runs built.
    const lastingInjuryBackfillOutcome = await app
      .get(TpLastingInjuryBackfillImportService)
      .importLastingInjuryHistory([
        ...insertedPlayerIds,
        ...matchFilesOutcome.insertedStarPlayerIds,
      ]);

    // Runs last of all: TP records no player trophy winners at all, so every
    // player trophy for a TP-sourced competition is computed here, from the
    // match events and outcomes the steps above imported.
    const missingTrophyAwardsOutcome = await app
      .get(TpMissingTrophyAwardsImportService)
      .importMissingTrophyAwards([...competitionIdsByTpId.values()]);

    // One-off developer review aid: whatever SPP the ongoing-competition
    // estimate could NOT explain, so a real discrepancy can be told apart from
    // the estimate's grouping approximations. Not persisted anywhere.
    for (const line of app
      .get(TpSppAdjustmentsImportService)
      .summaryLines(sppAdjustmentsOutcome.nonzeroAdjustments)) {
      console.log(line);
    }

    const results = [
      leagueOutcome.result,
      rulesSetsOutcome.result,
      eraOutcome.result,
      competitionSources.result,
      coachOutcome.result,
      rosterCollectionResult,
      officialTeamsCollectionResult,
      skillNameCollectionResult,
      officialTeamsOutcome.racesResult,
      officialTeamsOutcome.positionsResult,
      officialTeamsOutcome.characteristicsResult,
      officialTeamsOutcome.keywordsResult,
      officialTeamsOutcome.startingSkillsResult,
      officialTeamsOutcome.skillCategoriesResult,
      rosterImport.teamResult,
      rosterImport.playerResult,
      competitionOutcome.competitionResult,
      competitionOutcome.participationResult,
      competitionOutcome.trophyAwardsResult,
      competitionIdResolutionResult,
      matchFilesOutcome.matchResult,
      matchFilesOutcome.participationResult,
      matchFilesOutcome.starPlayerHiresResult,
      matchFilesOutcome.eventsResult,
      matchFilesOutcome.outcomeResult,
      sppAdjustmentsOutcome.result,
      lastingInjuryBackfillOutcome.result,
      missingTrophyAwardsOutcome.result,
    ];
    return {
      success: results.every((r) => r.success),
      imported: results.reduce((sum, r) => sum + r.imported, 0),
      errors: results.flatMap((r) => r.errors),
    };
  } finally {
    await app.close();
  }
}

run()
  .then((result) => {
    if (result.success) {
      console.log(`Imported ${result.imported} record(s) successfully.`);
    } else {
      console.error(`Import completed with ${result.errors.length} errors:`);
      result.errors.forEach((e) => console.error(`  - ${e.message}`));
      process.exit(1);
    }
  })
  .catch((error: unknown) => {
    console.error('Import failed:', error);
    process.exit(1);
  });
