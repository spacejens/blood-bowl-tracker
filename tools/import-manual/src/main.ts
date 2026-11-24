#!/usr/bin/env node

import { runApp } from '@blood-bowl-tracker/cli-shared';

import { AppModule } from './app.module';
import { ImportManualCliService } from './cli/import-manual-cli.service';

void runApp({
  module: AppModule.register(),
  run: (app) =>
    app.get(ImportManualCliService).execute({
      args: process.argv.slice(2),
      cwd: process.cwd(),
    }),
  onOutcome: (outcome) => {
    outcome.stdout.forEach((line) => console.log(line));
    outcome.stderr.forEach((line) => console.error(line));
    return outcome.exitCode;
  },
  failureLabel: 'Import failed:',
});
