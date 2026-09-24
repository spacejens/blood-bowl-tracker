#!/usr/bin/env node

import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { TpCoachesImportService } from './coaches/tp-coaches-import.service';
import { TpCompetitionIdResolverService } from './competitions/tp-competition-id-resolver.service';
import { TpCompetitionSourcesService } from './competitions/tp-competition-sources.service';
import { TpCompetitionsImportService } from './competitions/tp-competitions-import.service';
import { TpErasImportService } from './eras/tp-eras-import.service';
import { TpKeywordCatalogService } from './keywords/tp-keyword-catalog.service';
import { TpPositionKeywordsImportService } from './keywords/tp-position-keywords-import.service';
import { TpLeaguesImportService } from './leagues/tp-leagues-import.service';
import { TpMatchFilesImportService } from './match-files/tp-match-files-import.service';
import type { InducedStarPlayerHireGroup } from './players/tp-induced-star-players-import.service';
import { TpInducedStarPlayersStepService } from './players/tp-induced-star-players-step.service';
import { TpLastingInjuryBackfillImportService } from './players/tp-lasting-injury-backfill-import.service';
import { TpMercenaryPositionRaceErasImportService } from './players/tp-mercenary-position-race-eras-import.service';
import { TpPlayerSkillsImportService } from './players/tp-player-skills-import.service';
import { TpSppAdjustmentsImportService } from './players/tp-spp-adjustments-import.service';
import { TpPositionCharacteristicsImportService } from './positions/tp-position-characteristics-import.service';
import { TpPositionSkillsImportService } from './positions/tp-position-skills-import.service';
import { TpPositionsImportService } from './positions/tp-positions-import.service';
import { TpRacesImportService } from './races/tp-races-import.service';
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
    // its era and its parsed matches feed the hired-star and match-snapshot
    // passes below, long before the competitions themselves are imported
    // (after the rosters, further down). Nothing is upserted here.
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
    // characteristics) is scanned and parsed once here, then shared by the
    // races/positions imports below -- the canonical per-rules-set source,
    // independent of which rosters happened to be played.
    const officialTeamsErrors: ImportError[] = [];
    const officialTeams = await app
      .get(OfficialTeamsCollectionService)
      .collect(officialTeamsErrors);
    const officialTeamsCollectionResult = app.get(ImportResultService).result({
      imported: 0,
      errors: officialTeamsErrors,
    });

    const raceOutcome = await app
      .get(TpRacesImportService)
      .importRaces(officialTeams);

    const {
      result: positionResult,
      characteristicsByPositionId,
      skillRefsByPositionId,
      keywordCodesByPositionId,
      positionNamesById,
    } = await app.get(TpPositionsImportService).importPositions(officialTeams, {
      raceNamesById: raceOutcome.raceNamesById,
    });

    // Characteristics run immediately after the positions step that produced
    // them: the map is keyed by the position ids that step just upserted, and
    // by the rules set ids its era config resolved. This runs in the same TP
    // importer invocation that writes position availability, which is a
    // separate (and later) invocation than the BBL importer's -- so for every
    // position both sources describe, TP's values overwrite BBL's. That
    // ordering is deliberate: TP's values are per-rules-set and authoritative,
    // where BBL's are a converted single snapshot.
    // Star players need no special casing: position_rules_sets is keyed by
    // positionId alone, and star race/era availability now comes from the
    // positions step itself (its syncRaceEras calls above), not from this
    // characteristics step.
    const positionCharacteristicsOutcome = await app
      .get(TpPositionCharacteristicsImportService)
      .syncPositionCharacteristics(characteristicsByPositionId);

    // The curated keyword catalogue is read once here, avoiding a repeated
    // read cost, and passed down to the position-keyword import below.
    const keywordCatalogErrors: ImportError[] = [];
    const keywordCatalog = await app
      .get(TpKeywordCatalogService)
      .load(keywordCatalogErrors);
    const keywordCatalogResult = app.get(ImportResultService).result({
      imported: 0,
      errors: keywordCatalogErrors,
    });

    // Position keywords run after the characteristics step for the same hard
    // reason starting skills do: the API rejects a keyword for a (position,
    // rules set) with no characteristics row, which that step is what
    // creates.
    const positionKeywordsOutcome = await app
      .get(TpPositionKeywordsImportService)
      .syncPositionKeywords({
        keywordCodesByPositionId,
        catalog: keywordCatalog,
        positionNamesById,
      });

    // The skillMasterId -> name lookup is scanned once here, from the same
    // mirror the rosters/matches were read from: rosters_masters names skills
    // by id only, while every real roster and match embeds the name.
    const skillNameErrors: ImportError[] = [];
    const skillMastersByMasterId = await app
      .get(SkillMasterNameCollectionService)
      .collect(skillNameErrors);
    const skillNameCollectionResult = app.get(ImportResultService).result({
      imported: 0,
      errors: skillNameErrors,
    });

    // Starting skills run after the characteristics step for a hard reason:
    // the API rejects a starting skill for a (position, rules set) with no
    // characteristics row, which that step is what creates.
    const rulesSetNamesById = new Map(
      [...rulesSetsOutcome.rulesSetsByName.values()].map((rulesSet) => [
        rulesSet.id,
        rulesSet.name,
      ]),
    );
    const positionSkillsOutcome = await app
      .get(TpPositionSkillsImportService)
      .syncPositionSkills({
        skillRefsByPositionId,
        skillMastersByMasterId,
        positionNamesById,
        rulesSetNamesById,
        catalog: keywordCatalog,
      });

    // A roster id can be imported under more than one era, so resolving a
    // hired star player's team era later needs the real eraId the
    // inducements_roll event came from -- not a guess: the era of the
    // directory the match's competition was found in, which the competition
    // scan above already resolved.

    // Star players hired via an inducements_roll event aren't part of any
    // roster's lineUps[], so they're gathered from the already-parsed match
    // events (already-parsed data reused here, not re-scanned) and grouped
    // by the hiring roster id AND the real era the match's
    // competition belongs to (so a roster id spanning multiple eras
    // resolves its team era unambiguously downstream, instead of guessing).
    // The eraId lookup below is optional only for TypeScript's sake: every
    // key in matchesByCompetitionTpId comes from a competition
    // TpCompetitionSourcesService already validated has an eraId, so the
    // undefined branch (match-embedded player accumulation above still runs)
    // is unreachable in practice.
    //
    // This same pass also builds matchEmbeddedPlayersByRosterId: a standalone
    // rosters_<id>.json file only reflects a roster's CURRENT composition as
    // of when the local TP data mirror was downloaded, so a player who has
    // since left/been replaced is silently absent from it even though
    // historical matchEvents[] can still reference them. Each match's own
    // homeRosterPlayers/awayRosterPlayers (parsed from
    // inscriptionLocal/Visitor.roster.lineUps[]) embeds a per-match snapshot
    // of that side's roster, so accumulating them across every match a
    // roster played (deduped by player id) fills that gap without a third
    // scan of matchesByCompetitionTpId.
    const inducedStarPlayerHireGroupsByKey = new Map<
      string,
      InducedStarPlayerHireGroup
    >();
    const matchEmbeddedPlayersByRosterIdMut = new Map<
      number,
      Map<number, TpRosterPlayer>
    >();
    const accumulateMatchEmbeddedPlayers = (
      rosterId: number,
      players: TpRosterPlayer[],
    ) => {
      let byPlayerId = matchEmbeddedPlayersByRosterIdMut.get(rosterId);
      if (!byPlayerId) {
        byPlayerId = new Map<number, TpRosterPlayer>();
        matchEmbeddedPlayersByRosterIdMut.set(rosterId, byPlayerId);
      }
      for (const player of players) {
        byPlayerId.set(player.id, player);
      }
    };
    for (const [
      competitionTpId,
      matches,
    ] of competitionSources.matchesByCompetitionTpId.entries()) {
      const eraId =
        competitionSources.competitionsByTpId.get(competitionTpId)?.eraId;
      for (const match of matches) {
        accumulateMatchEmbeddedPlayers(
          match.homeTeamTpId,
          match.homeRosterPlayers,
        );
        accumulateMatchEmbeddedPlayers(
          match.awayTeamTpId,
          match.awayRosterPlayers,
        );

        if (eraId === undefined) {
          continue;
        }
        for (const event of match.matchEvents) {
          if (
            event.type !== 'inducements_roll' ||
            event.starPlayers.length === 0
          ) {
            continue;
          }
          const key = `${event.rosterId}:${eraId}`;
          const existingGroup = inducedStarPlayerHireGroupsByKey.get(key);
          if (existingGroup) {
            existingGroup.starPlayers.push(...event.starPlayers);
          } else {
            inducedStarPlayerHireGroupsByKey.set(key, {
              rosterId: event.rosterId,
              eraId,
              starPlayers: [...event.starPlayers],
            });
          }
        }
      }
    }
    const inducedStarPlayerHireGroups = Array.from(
      inducedStarPlayerHireGroupsByKey.values(),
    );
    const matchEmbeddedPlayersByRosterId = new Map(
      Array.from(matchEmbeddedPlayersByRosterIdMut.entries()).map(
        ([rosterId, byPlayerId]) => [rosterId, Array.from(byPlayerId.values())],
      ),
    );

    // Each roster file goes to the server as-is (tpRosters.import), which
    // parses it and upserts its team and players; this runs after
    // positions because players resolve their position against what the
    // positions step just upserted. Each call also carries that roster's
    // match-snapshot-only players (matchEmbeddedPlayersByRosterId, above),
    // so a player who has since left a roster is still imported. The
    // returned ids are what every later step resolves teams and players by.
    const rosterImport = await app
      .get(TpRosterFilesImportService)
      .importRosterFiles({ rosters, matchEmbeddedPlayersByRosterId });
    const {
      teamErasByRosterId,
      playerIdsByLineUpId,
      insertedPlayerIds,
      mercenaryPositionUsages,
    } = rosterImport;

    // Star players hired through an inducements_roll are on no roster file,
    // so they are imported here from the match data. characteristicsByPositionId
    // (from the positions step) supplies a freshly hired star's template values.
    const starHiresOutcome = await app
      .get(TpInducedStarPlayersStepService)
      .importStarHires({
        groups: inducedStarPlayerHireGroups,
        teamErasByRosterId,
        characteristicsByPositionId,
      });
    const { starPlayerIdsByRosterAndMaster } = starHiresOutcome;

    // Skills and career SPP counts come straight off the parsed roster
    // files, keyed by the DB ids the roster import returned.
    const { skillsByPlayerId, careerSppCountsByPlayerId } = app
      .get(TpRosterPlayerFactsService)
      .collect({ rosters, playerIdsByLineUpId });

    // Player skills reuse the same scanned skillMasterId -> name lookup the
    // position starting-skills step above used, so no second scan happens.
    const playerSkillsOutcome = await app
      .get(TpPlayerSkillsImportService)
      .syncPlayerSkills({
        skillsByPlayerId,
        skillMastersByMasterId,
        catalog: keywordCatalog,
      });

    // A mercenary Big Guy hire (e.g. "Giant Mercenary") appears on no TP
    // official-list catalog at all, so -- unlike regular and star positions,
    // which the official team list now describes directly -- its
    // positions_race_eras rows still have to be derived from actual usage:
    // the mercenaryPositionUsages the players step just emitted. Runs after
    // players because that usage (which team/race+era each mercenary was
    // hired into) is only known once players are imported. Idempotent
    // (syncRaceEras is upsert-only).
    const mercenaryPositionRaceErasOutcome = await app
      .get(TpMercenaryPositionRaceErasImportService)
      .syncMercenaryPositionRaceEras({
        mercenaryPositionUsages,
      });

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
    // links its teams, imports its events and resolves its outcome. It runs
    // after the roster, star-player and competition imports because the
    // server resolves each match's teams and players by the TP ids those
    // steps wrote, and before the SPP and lasting-injury passes, which read
    // its match events.
    const matchFilesOutcome = await app
      .get(TpMatchFilesImportService)
      .importMatchFiles({
        competitionsByTpId: competitionSources.competitionsByTpId,
        competitionIdsByTpId,
        matchesByCompetitionTpId: competitionSources.matchesByCompetitionTpId,
      });

    // Runs after the match-files step: the adjustment is the gap between
    // TP's own reported career total (already stored on players.spp_total by
    // the players step) and what the player's events explain -- the spp_value
    // those events just wrote, PLUS an estimate of the SPP earned in
    // competitions still in progress that have not been imported, priced from
    // the career action counts the players step collected. Star players hired
    // via an inducements_roll carry no reported total, so the server skips
    // them and their adjustment stays NULL.
    const sppAdjustmentsOutcome = await app
      .get(TpSppAdjustmentsImportService)
      .importSppAdjustments({
        playerIds: [
          ...playerIdsByLineUpId.values(),
          ...starPlayerIdsByRosterAndMaster.values(),
        ],
        careerCountsByPlayerId: careerSppCountsByPlayerId,
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
        ...starHiresOutcome.insertedPlayerIds,
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
      raceOutcome.result,
      rosterImport.teamResult,
      positionResult,
      positionCharacteristicsOutcome.result,
      keywordCatalogResult,
      positionKeywordsOutcome.result,
      skillNameCollectionResult,
      positionSkillsOutcome.result,
      rosterImport.playerResult,
      starHiresOutcome.result,
      playerSkillsOutcome.result,
      mercenaryPositionRaceErasOutcome.result,
      competitionOutcome.competitionResult,
      competitionOutcome.participationResult,
      competitionOutcome.trophyAwardsResult,
      competitionIdResolutionResult,
      matchFilesOutcome.matchResult,
      matchFilesOutcome.participationResult,
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
