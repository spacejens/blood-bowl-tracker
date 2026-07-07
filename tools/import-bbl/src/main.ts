#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { parseBblExport } from './bbl/bbl-parser';
import { BblCoachesImportService } from './bbl/bbl-coaches-import.service';

const [, , filePath] = process.argv;

if (!filePath) {
  console.error('Usage: import-bbl <bbl-export.json>');
  process.exit(1);
}

async function run(filePath: string) {
  const json = readFileSync(filePath, 'utf-8');
  const data = parseBblExport(json);

  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    const importer = app.get(BblCoachesImportService);
    return await importer.importBblData(data);
  } finally {
    await app.close();
  }
}

run(filePath)
  .then((result) => {
    if (result.success) {
      console.log(`Imported ${result.imported} coach(es) successfully.`);
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
