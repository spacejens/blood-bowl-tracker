#!/usr/bin/env node

import type { ImportResult } from '@blood-bowl-tracker/import';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { BblCoachesImportService } from './coaches/bbl-coaches-import.service';
import { BblCompetitionsImportService } from './competitions/bbl-competitions-import.service';
import { BblErasImportService } from './eras/bbl-eras-import.service';
import { BblLeaguesImportService } from './leagues/bbl-leagues-import.service';
import { BblMatchEventsImportService } from './match-events/bbl-match-events-import.service';
import { BblMatchOutcomesImportService } from './matches/bbl-match-outcomes-import.service';
import { BblMatchesImportService } from './matches/bbl-matches-import.service';
import { BblPlayersImportService } from './players/bbl-players-import.service';
import { BblPositionRaceErasImportService } from './positions/bbl-position-race-eras-import.service';
import { BblPositionsImportService } from './positions/bbl-positions-import.service';
import { BblRacesImportService } from './races/bbl-races-import.service';
import { BblRulesSetsImportService } from './rules-sets/bbl-rules-sets-import.service';
import { BblTeamParticipationImportService } from './team-participation/bbl-team-participation-import.service';
import { BblTeamsImportService } from './teams/bbl-teams-import.service';

async function run(): Promise<ImportResult> {
  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    // Bootstrap order: the league is foundational; rules sets and eras come
    // from config and must exist before entities that reference them.
    const leagueOutcome = await app
      .get(BblLeaguesImportService)
      .importLeagues();
    const rulesSetsOutcome = await app
      .get(BblRulesSetsImportService)
      .importRulesSets();
    const eraOutcome = await app
      .get(BblErasImportService)
      .importEras(
        leagueOutcome.leagueIdsByName,
        rulesSetsOutcome.rulesSetIdsByName,
      );
    const competitionOutcome = await app
      .get(BblCompetitionsImportService)
      .importCompetitions(eraOutcome.eraIdsByName);
    const matchOutcome = await app
      .get(BblMatchesImportService)
      .importMatches(
        competitionOutcome.competitionsByBblId,
        competitionOutcome.competitionIdsByBblId,
      );
    const coachOutcome = await app.get(BblCoachesImportService).importCoaches();
    const raceOutcome = await app.get(BblRacesImportService).importRaces();
    const teamOutcome = await app
      .get(BblTeamsImportService)
      .importTeams(raceOutcome.raceIdsByBblId, coachOutcome.coachIdsByName);
    const teamParticipationOutcome = await app
      .get(BblTeamParticipationImportService)
      .importTeamParticipation({
        competitionsByBblId: competitionOutcome.competitionsByBblId,
        teamsByCode: teamOutcome.teamsByCode,
        racesByRaceId: raceOutcome.racesByRaceId,
        eraIdsByName: eraOutcome.eraIdsByName,
        competitionIdsByBblId: competitionOutcome.competitionIdsByBblId,
      });
    const positionOutcome = await app
      .get(BblPositionsImportService)
      .importPositions(raceOutcome.racesByBblId, teamOutcome.teamRaceIdsByCode);
    const playerOutcome = await app.get(BblPlayersImportService).importPlayers({
      teamsByCode: teamOutcome.teamsByCode,
      positionIdsByBblId: positionOutcome.positionIdsByBblId,
      racesByBblId: raceOutcome.racesByBblId,
      eraIdsByName: eraOutcome.eraIdsByName,
    });
    const positionRaceErasOutcome = await app
      .get(BblPositionRaceErasImportService)
      .syncPositionRaceEras({
        positionRaceCandidates: positionOutcome.positionRaceCandidates,
        positionIdsByBblId: positionOutcome.positionIdsByBblId,
        racesByBblId: raceOutcome.racesByBblId,
        eraIdsByName: eraOutcome.eraIdsByName,
        eraIdsByRaceId: teamParticipationOutcome.eraIdsByRaceId,
        positionsUsedByEra: playerOutcome.positionsUsedByEra,
        racesActiveByEra: playerOutcome.racesActiveByEra,
      });
    const matchEventsOutcome = await app
      .get(BblMatchEventsImportService)
      .importMatchEvents({
        competitionsByBblId: competitionOutcome.competitionsByBblId,
        teamsByCode: teamOutcome.teamsByCode,
        matchIdsByBblId: matchOutcome.matchIdsByBblId,
        playerIdsByPid: playerOutcome.playerIdsByPid,
      });

    // Match outcomes run last: scores are counted from the touchdown events
    // imported just above, and a tied knock-out match's winner is traced
    // through sibling matches that must already exist.
    const matchOutcomesOutcome = await app
      .get(BblMatchOutcomesImportService)
      .importMatchOutcomes({
        competitionIdsByBblId: competitionOutcome.competitionIdsByBblId,
        matchIdsByBblId: matchOutcome.matchIdsByBblId,
        categoriesByBblId: matchOutcome.categoriesByBblId,
        teamEraIdsByCompetitionBblId:
          teamParticipationOutcome.teamEraIdsByCompetitionBblId,
      });

    const results = [
      leagueOutcome.result,
      rulesSetsOutcome.result,
      eraOutcome.result,
      competitionOutcome.result,
      matchOutcome.result,
      coachOutcome.result,
      raceOutcome.result,
      teamOutcome.result,
      teamParticipationOutcome.result,
      positionOutcome.result,
      playerOutcome.result,
      positionRaceErasOutcome.result,
      matchEventsOutcome.result,
      matchOutcomesOutcome.result,
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
