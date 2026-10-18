#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { CliOutcome } from './cli/import-manual-cli.service';
import { ImportManualCliService } from './cli/import-manual-cli.service';

async function run(): Promise<CliOutcome> {
  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    return await app.get(ImportManualCliService).execute({
      args: process.argv.slice(2),
      cwd: process.cwd(),
    });
  } finally {
    await app.close();
  }
}

run()
  .then((outcome) => {
    outcome.stdout.forEach((line) => console.log(line));
    outcome.stderr.forEach((line) => console.error(line));
    if (outcome.exitCode !== 0) {
      process.exit(outcome.exitCode);
    }
  })
  .catch((error: unknown) => {
    console.error('Import failed:', error);
    process.exit(1);
  });
