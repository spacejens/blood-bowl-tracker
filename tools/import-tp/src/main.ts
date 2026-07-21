#!/usr/bin/env node

import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { makeImportResult } from '@blood-bowl-tracker/import';
import type { TpInducedStarPlayer } from '@blood-bowl-tracker/parse-tp';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { TpCoachesImportService } from './coaches/tp-coaches-import.service';
import { TpCompetitionsImportService } from './competitions/tp-competitions-import.service';
import { TpErasImportService } from './eras/tp-eras-import.service';
import { TpLeaguesImportService } from './leagues/tp-leagues-import.service';
import { TpMatchesImportService } from './matches/tp-matches-import.service';
import { TpPlayersImportService } from './players/tp-players-import.service';
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    const rosterCollectionResult = makeImportResult({
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

    const { result: positionResult, positionIdsByTpPositionId } = await app
      .get(TpPositionsImportService)
      .importPositions(
        rosters,
        raceOutcome.raceIdsByTeamRaceCode,
        eraOutcome.eraIdsByName,
      );

    // Star players hired via an inducements_roll event aren't part of any
    // roster's lineUps[], so they're gathered from the already-parsed match
    // events (one scan, shared with Task 8's match-events step reusing the
    // same matchesByCompetitionId) and grouped by the hiring roster id.
    const inducedStarPlayersByRosterId = new Map<
      number,
      TpInducedStarPlayer[]
    >();
    for (const matches of competitionOutcome.matchesByCompetitionId.values()) {
      for (const match of matches) {
        for (const event of match.matchEvents) {
          if (
            event.type !== 'inducements_roll' ||
            event.starPlayers.length === 0
          ) {
            continue;
          }
          inducedStarPlayersByRosterId.set(event.rosterId, [
            ...(inducedStarPlayersByRosterId.get(event.rosterId) ?? []),
            ...event.starPlayers,
          ]);
        }
      }
    }

    // Players run after positions and teams: each roster player resolves a
    // team era (via teamOutcome.teamErasByRosterId) and a position (via
    // positionIdsByTpPositionId), so both must exist first. playerIdsByLineUpId
    // and starPlayerIdsByRosterAndMaster are kept in scope for the
    // match-events step (Task 8).
    const {
      result: playerResult,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      playerIdsByLineUpId,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      starPlayerIdsByRosterAndMaster,
    } = await app.get(TpPlayersImportService).importPlayers({
      rosters,
      teamErasByRosterId: teamOutcome.teamErasByRosterId,
      eraIdsByName: eraOutcome.eraIdsByName,
      positionIdsByTpPositionId,
      inducedStarPlayersByRosterId,
    });

    // Team participation (match_teams + competition_teams) runs last: it needs
    // the teams step's resolved team-era ids, and consumes the competitions
    // step's maps and the already-collected rosters — no new file scanning.
    const teamParticipationOutcome = await app
      .get(TpTeamParticipationImportService)
      .importTeamParticipation({
        competitionsByTpId: competitionOutcome.competitionsByTpId,
        competitionIdsByTpId: competitionOutcome.competitionIdsByTpId,
        matchesByCompetitionId: competitionOutcome.matchesByCompetitionId,
        teamErasByRosterId: teamOutcome.teamErasByRosterId,
        rosters,
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
      teamParticipationOutcome.result,
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
