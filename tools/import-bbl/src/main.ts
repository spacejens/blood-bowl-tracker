#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';
import type { ImportResult } from '@blood-bowl-tracker/import';
import { AppModule } from './app.module';
import { BblLeaguesImportService } from './leagues/bbl-leagues-import.service';
import { BblCoachesImportService } from './coaches/bbl-coaches-import.service';

async function run(): Promise<ImportResult> {
  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    // Leagues import first: the league is the foundational entity other
    // imports will depend on.
    const leagueResult = await app.get(BblLeaguesImportService).importLeague();
    const coachResult = await app.get(BblCoachesImportService).importCoaches();
    return {
      success: leagueResult.success && coachResult.success,
      imported: leagueResult.imported + coachResult.imported,
      errors: [...leagueResult.errors, ...coachResult.errors],
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
