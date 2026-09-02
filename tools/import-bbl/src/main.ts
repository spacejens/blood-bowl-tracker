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
import { BblSppAdjustmentsImportService } from './players/bbl-spp-adjustments-import.service';
import { BblPositionCharacteristicsImportService } from './positions/bbl-position-characteristics-import.service';
import { BblPositionRaceErasImportService } from './positions/bbl-position-race-eras-import.service';
import { BblPositionsImportService } from './positions/bbl-positions-import.service';
import { BblRacesImportService } from './races/bbl-races-import.service';
import { BblRulesSetsImportService } from './rules-sets/bbl-rules-sets-import.service';
import { BblTeamParticipationImportService } from './team-participation/bbl-team-participation-import.service';
import { BblTeamsImportService } from './teams/bbl-teams-import.service';
import { BblTrophyAwardsImportService } from './trophy-awards/bbl-trophy-awards-import.service';

async function run(): Promise<ImportResult> {
  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    // Bootstrap order: the league is foundational; rules sets and eras come
    // from config and must exist before entities that reference them. The
    // eras step resolves each era's league and rules sets server-side, by
    // external id, so a league or rules set must be upserted here before an
    // era referencing it can resolve.
    const leagueOutcome = await app
      .get(BblLeaguesImportService)
      .importLeagues();
    const rulesSetsOutcome = await app
      .get(BblRulesSetsImportService)
      .importRulesSets();
    const eraOutcome = await app.get(BblErasImportService).importEras();
    const competitionOutcome = await app
      .get(BblCompetitionsImportService)
      .importCompetitions();
    const matchOutcome = await app
      .get(BblMatchesImportService)
      .importMatches(competitionOutcome.competitionsByBblId);
    // Races and coaches must be upserted before teams referencing them can be
    // resolved server-side, by external id.
    const coachOutcome = await app.get(BblCoachesImportService).importCoaches();
    const raceOutcome = await app.get(BblRacesImportService).importRaces();
    const teamOutcome = await app.get(BblTeamsImportService).importTeams();
    const teamParticipationOutcome = await app
      .get(BblTeamParticipationImportService)
      .importTeamParticipation({
        competitionsByBblId: competitionOutcome.competitionsByBblId,
        teamsByCode: teamOutcome.teamsByCode,
        racesByRaceId: raceOutcome.racesByRaceId,
      });
    const positionOutcome = await app
      .get(BblPositionsImportService)
      .importPositions(raceOutcome.racesByBblId, teamOutcome.teamRaceIdsByCode);
    const playerOutcome = await app.get(BblPlayersImportService).importPlayers({
      teamsByCode: teamOutcome.teamsByCode,
      racesByBblId: raceOutcome.racesByBblId,
    });
    const positionRaceErasOutcome = await app
      .get(BblPositionRaceErasImportService)
      .syncPositionRaceEras({
        positionRaceCandidates: positionOutcome.positionRaceCandidates,
        racesByBblId: raceOutcome.racesByBblId,
        rulesSetsByName: rulesSetsOutcome.rulesSetsByName,
        eraIdsByRaceId: teamParticipationOutcome.eraIdsByRaceId,
        positionsUsedByEra: playerOutcome.positionsUsedByEra,
      });
    // Characteristics run right after the race-era sync, which is what decides
    // the rules sets each position needs a row for. The values themselves come
    // from the positions step's page scrape.
    const positionCharacteristicsOutcome = await app
      .get(BblPositionCharacteristicsImportService)
      .syncPositionCharacteristics({
        rulesSetIdsByPositionId:
          positionRaceErasOutcome.rulesSetIdsByPositionId,
        characteristicsByPositionId:
          positionOutcome.characteristicsByPositionId,
        rulesSetsByName: rulesSetsOutcome.rulesSetsByName,
      });
    const matchEventsOutcome = await app
      .get(BblMatchEventsImportService)
      .importMatchEvents({
        competitionsByBblId: competitionOutcome.competitionsByBblId,
        teamsByCode: teamOutcome.teamsByCode,
        matchIdsByBblId: matchOutcome.matchIdsByBblId,
        playerIdsByPid: playerOutcome.playerIdsByPid,
      });

    // Runs after the match-events step because it depends on the spp_value
    // those events just wrote. BBL's own displayed career total (scraped by
    // the players step) is not stored directly — the server uses it to
    // recover spp_adjustment, then rebuilds spp_total as the era-correct
    // event sum plus that adjustment.
    const sppAdjustmentsOutcome = await app
      .get(BblSppAdjustmentsImportService)
      .importSppAdjustments(playerOutcome.scrapedSppTotalsByPlayerId);

    // Match outcomes run after match events: scores are counted from the
    // touchdown events imported just above, and a tied knock-out match's
    // winner is traced through sibling matches that must already exist.
    // (Trophy awards run after this step — see below.)
    const matchOutcomesOutcome = await app
      .get(BblMatchOutcomesImportService)
      .importMatchOutcomes({
        competitionsByBblId: competitionOutcome.competitionsByBblId,
        matchIdsByBblId: matchOutcome.matchIdsByBblId,
        categoriesByBblId: matchOutcome.categoriesByBblId,
        teamEraIdsByCompetitionBblId:
          teamParticipationOutcome.teamEraIdsByCompetitionBblId,
      });

    // Trophy awards run after team participation and players: each award row
    // names a team era within its competition, or a player (recorded under
    // that player's own team era). The trophies themselves are curated data
    // seeded by tools/import-manual, which always runs before this importer.
    // The enriched competition entries are passed (not the plain upsert map):
    // resolving a trophy needs each competition's curated group.
    const trophyAwardsOutcome = await app
      .get(BblTrophyAwardsImportService)
      .importTrophyAwards({
        competitionEntriesByBblId: competitionOutcome.competitionEntriesByBblId,
        teamEraIdsByCompetitionBblId:
          teamParticipationOutcome.teamEraIdsByCompetitionBblId,
        playerIdsByPid: playerOutcome.playerIdsByPid,
        teamEraIdsByPid: playerOutcome.teamEraIdsByPid,
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
      positionCharacteristicsOutcome.result,
      matchEventsOutcome.result,
      sppAdjustmentsOutcome.result,
      matchOutcomesOutcome.result,
      trophyAwardsOutcome.result,
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
