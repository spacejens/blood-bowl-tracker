#!/usr/bin/env node

import { resolve } from 'node:path';

import type { ImportResult } from '@blood-bowl-tracker/import';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { ManualImportService } from './import/manual-import.service';

async function run(): Promise<ImportResult> {
  const arg = process.argv[2];
  if (arg === undefined || arg === '') {
    throw new Error(
      'Usage: node dist/main.js <data-directory> ' +
        '(e.g. data/before-other-importers or data/after-other-importers).',
    );
  }
  const dir = resolve(process.cwd(), arg);

  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    return await app.get(ManualImportService).run(dir);
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
