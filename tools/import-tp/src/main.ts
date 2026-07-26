#!/usr/bin/env node

import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type {
  TpInducedStarPlayer,
  TpRosterPlayer,
} from '@blood-bowl-tracker/parse-tp';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { TpCoachesImportService } from './coaches/tp-coaches-import.service';
import { TpCompetitionsImportService } from './competitions/tp-competitions-import.service';
import { TpErasImportService } from './eras/tp-eras-import.service';
import { TpLeaguesImportService } from './leagues/tp-leagues-import.service';
import { TpMatchEventsImportService } from './match-events/tp-match-events-import.service';
import { TpMatchesImportService } from './matches/tp-matches-import.service';
import { TpPlayersImportService } from './players/tp-players-import.service';
import { TpPositionRaceErasImportService } from './positions/tp-position-race-eras-import.service';
import { TpPositionsImportService } from './positions/tp-positions-import.service';
import { TpRacesImportService } from './races/tp-races-import.service';
import { TpRulesSetsImportService } from './rules-sets/tp-rules-sets-import.service';
import { RosterCollectionService } from './source/roster-collection.service';
import { TpTeamParticipationImportService } from './team-participation/tp-team-participation-import.service';
import { TpTeamsImportService } from './teams/tp-teams-import.service';

async function run(): Promise<ImportResult> {
  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    // Bootstrap order: the league is foundational; rule sets and eras come
    // from config and must exist before entities that reference them, then
    // competitions, resolved from the era directories.
    const leagueOutcome = await app.get(TpLeaguesImportService).importLeague();
    const rulesSetsOutcome = await app
      .get(TpRulesSetsImportService)
      .importRulesSets();
    const eraOutcome = await app
      .get(TpErasImportService)
      .importEras(leagueOutcome.leagueId, rulesSetsOutcome.rulesSetIdsByName);

    const competitionOutcome = await app
      .get(TpCompetitionsImportService)
      .importCompetitions(eraOutcome.eraIdsByName);

    // Matches link to their competition only via the directory scan competitions
    // import already performed (match files carry no tournament id), so this
    // consumes competitionOutcome.matchesByCompetitionId rather than re-scanning.
    const { result: matchResult, matchIdsByTpId } = await app
      .get(TpMatchesImportService)
      .importMatches(competitionOutcome.matchesByCompetitionId);

    const coachOutcome = await app.get(TpCoachesImportService).importCoaches();

    // Roster files (rosters_<id>.json) are scanned and parsed once here, then
    // shared by races/teams/positions below, so a bad file is reported once
    // instead of independently by each of the three imports.
    const rosterErrors: ImportError[] = [];
    const rosters = await app
      .get(RosterCollectionService)
      .collect(rosterErrors);
    const rosterCollectionResult = app.get(ImportResultService).result({
      imported: 0,
      errors: rosterErrors,
    });

    const raceOutcome = await app
      .get(TpRacesImportService)
      .importRaces(rosters, eraOutcome.eraIdsByName);

    const teamOutcome = await app
      .get(TpTeamsImportService)
      .importTeams(rosters, {
        raceIdsByTeamRaceCode: raceOutcome.raceIdsByTeamRaceCode,
        coachIdsByTpId: coachOutcome.coachIdsByTpId,
        eraIdsByName: eraOutcome.eraIdsByName,
      });

    const {
      result: positionResult,
      positionIdsByTpPositionId,
      starPositionIds,
    } = await app.get(TpPositionsImportService).importPositions(rosters, {
      raceIdsByTeamRaceCode: raceOutcome.raceIdsByTeamRaceCode,
      eraIdsByName: eraOutcome.eraIdsByName,
      raceNamesById: raceOutcome.raceNamesById,
    });

    // A roster id can appear under more than one era (TpTeamsImportService's
    // era-union grouping), so resolving a hired star player's team era later
    // needs the real eraId the inducements_roll event came from -- not a
    // guess. The DB competition id (matchesByCompetitionId's key) maps to its
    // real eraId via competitionIdsByTpId + competitionsByTpId's upsert.eraId,
    // the same value TpTeamParticipationImportService already resolves
    // roster ids against.
    const eraIdByCompetitionId = new Map<number, number>();
    for (const [
      tpCompetitionId,
      dbCompetitionId,
    ] of competitionOutcome.competitionIdsByTpId) {
      const competitionEntry =
        competitionOutcome.competitionsByTpId.get(tpCompetitionId);
      if (competitionEntry) {
        // UpsertCompetitionSchema.eraId is optional (api-contract, issue
        // #174) to support partial-upsert payloads from other callers, but
        // TpCompetitionsImportService always resolves eraId from the era
        // name before building this upsert -- skipping and recording an
        // error otherwise -- so every entry reaching this map has one.
        const { eraId } = competitionEntry.upsert;
        if (eraId === undefined) {
          throw new Error(
            `Competition "${competitionEntry.upsert.name}" has no eraId; import-tp always resolves eraId before building its upsert.`,
          );
        }
        eraIdByCompetitionId.set(dbCompetitionId, eraId);
      }
    }

    // Star players hired via an inducements_roll event aren't part of any
    // roster's lineUps[], so they're gathered from the already-parsed match
    // events (one scan, shared with Task 8's match-events step reusing the
    // same matchesByCompetitionId) and grouped by the hiring roster id AND
    // the real era the match's competition belongs to (so a roster id spanning
    // multiple eras resolves its team era unambiguously downstream, instead of
    // guessing). A competition whose eraId can't be resolved is skipped
    // defensively -- shouldn't happen in practice.
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
    // scan of matchesByCompetitionId.
    const inducedStarPlayerHireGroupsByKey = new Map<
      string,
      { rosterId: number; eraId: number; starPlayers: TpInducedStarPlayer[] }
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
      competitionId,
      matches,
    ] of competitionOutcome.matchesByCompetitionId.entries()) {
      const eraId = eraIdByCompetitionId.get(competitionId);
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

    // Players run after positions and teams: each roster player resolves a
    // team era (via teamOutcome.teamErasByRosterId) and a position (via
    // positionIdsByTpPositionId), so both must exist first. Roster player
    // data is unioned with matchEmbeddedPlayersByRosterId (built above) so a
    // player who has since left/been replaced on a roster -- absent from the
    // standalone roster file -- is still imported and resolvable.
    // playerIdsByLineUpId and starPlayerIdsByRosterAndMaster are kept in
    // scope for the match-events step below.
    const {
      result: playerResult,
      playerIdsByLineUpId,
      starPlayerIdsByRosterAndMaster,
      starPositionUsages,
    } = await app.get(TpPlayersImportService).importPlayers({
      rosters,
      teamErasByRosterId: teamOutcome.teamErasByRosterId,
      eraIdsByName: eraOutcome.eraIdsByName,
      positionIdsByTpPositionId,
      inducedStarPlayerHireGroups,
      matchEmbeddedPlayersByRosterId,
      starPositionIds,
    });

    // Star positions get zero positions_race_eras rows from the regular
    // position sync (they're grouped by name, not race), so this post-players
    // step derives their (race, era) availability from actual usage -- the
    // starPositionUsages the players step just emitted. Regular positions are
    // already handled by TpPositionsImportService. Runs after players because
    // star usage (which team/race+era fielded each star) is only known once
    // players are imported. Idempotent (syncRaceEras is upsert-only).
    const positionRaceErasOutcome = await app
      .get(TpPositionRaceErasImportService)
      .syncStarPositionRaceEras({
        starPositionUsages,
        raceIdsByTeamRaceCode: raceOutcome.raceIdsByTeamRaceCode,
        eraIdsByName: eraOutcome.eraIdsByName,
      });

    // Team participation (match_teams + competition_teams) runs before match
    // events: match events resolve team-era ids the same way (roster id +
    // era), and — more importantly — the server upsert match events uses
    // resolves against match_teams, which this step is what populates.
    const teamParticipationOutcome = await app
      .get(TpTeamParticipationImportService)
      .importTeamParticipation({
        competitionsByTpId: competitionOutcome.competitionsByTpId,
        competitionIdsByTpId: competitionOutcome.competitionIdsByTpId,
        matchesByCompetitionId: competitionOutcome.matchesByCompetitionId,
        teamErasByRosterId: teamOutcome.teamErasByRosterId,
        rosters,
      });

    // Match events (touchdowns and injuries/casualties) run last: they need
    // match_teams (populated above), the players step's lineUpId/star-player
    // maps, and reuse the same matchesByCompetitionId + eraIdByCompetitionId
    // already built for the hired-star-player scan above (competition DB id
    // -> its real eraId), rather than resolving the era a second time.
    const matchEventsOutcome = await app
      .get(TpMatchEventsImportService)
      .importMatchEvents({
        matchesByCompetitionId: competitionOutcome.matchesByCompetitionId,
        eraIdByCompetitionId,
        matchIdsByTpId,
        teamErasByRosterId: teamOutcome.teamErasByRosterId,
        playerIdsByLineUpId,
        starPlayerIdsByRosterAndMaster,
      });

    const results = [
      leagueOutcome.result,
      rulesSetsOutcome.result,
      eraOutcome.result,
      competitionOutcome.result,
      matchResult,
      coachOutcome.result,
      rosterCollectionResult,
      raceOutcome.result,
      teamOutcome.result,
      positionResult,
      playerResult,
      positionRaceErasOutcome.result,
      teamParticipationOutcome.result,
      matchEventsOutcome.result,
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
