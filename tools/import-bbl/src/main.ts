#!/usr/bin/env node

import type { ImportResult } from '@blood-bowl-tracker/import';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { BblCoachesImportService } from './coaches/bbl-coaches-import.service';
import { BblErasImportService } from './eras/bbl-eras-import.service';
import { BblLeaguesImportService } from './leagues/bbl-leagues-import.service';
import { BblPositionsImportService } from './positions/bbl-positions-import.service';
import { BblRacesImportService } from './races/bbl-races-import.service';
import { BblRulesSetsImportService } from './rules-sets/bbl-rules-sets-import.service';
import { BblTeamsImportService } from './teams/bbl-teams-import.service';

async function run(): Promise<ImportResult> {
  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    // Bootstrap order: the league is foundational; rules sets and eras come
    // from config and must exist before entities that reference them.
    const leagueOutcome = await app.get(BblLeaguesImportService).importLeague();
    const rulesSetsOutcome = await app
      .get(BblRulesSetsImportService)
      .importRulesSets();
    const eraResult = await app
      .get(BblErasImportService)
      .importEras(leagueOutcome.leagueId, rulesSetsOutcome.rulesSetIdsByName);
    const coachOutcome = await app.get(BblCoachesImportService).importCoaches();
    const raceOutcome = await app.get(BblRacesImportService).importRaces();
    const positionResult = await app
      .get(BblPositionsImportService)
      .importPositions(raceOutcome.raceIdsByBblId);
    const teamOutcome = await app
      .get(BblTeamsImportService)
      .importTeams(raceOutcome.raceIdsByBblId, coachOutcome.coachIdsByName);

    const results = [
      leagueOutcome.result,
      rulesSetsOutcome.result,
      eraResult,
      coachOutcome.result,
      raceOutcome.result,
      positionResult,
      teamOutcome.result,
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
