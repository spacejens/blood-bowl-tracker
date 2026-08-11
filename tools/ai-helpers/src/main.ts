#!/usr/bin/env node

import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { CheckDriftService } from './check-drift/check-drift.service';
import { CheckMainStrayService } from './check-main-stray/check-main-stray.service';
import { GitRootsService } from './shared/git-roots.service';
import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';

const SUBCOMMANDS = [
  'resolve-main-root',
  'check-main-stray',
  'sync-gitignored',
  'check-drift',
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(value: string | undefined): value is Subcommand {
  return SUBCOMMANDS.includes(value as Subcommand);
}

function dispatch(
  app: INestApplicationContext,
  subcommand: Subcommand,
): Promise<unknown> {
  switch (subcommand) {
    case 'resolve-main-root':
      return app.get(GitRootsService).resolve();
    case 'check-main-stray':
      return app.get(CheckMainStrayService).run();
    case 'sync-gitignored':
      return app.get(SyncGitignoredService).run();
    case 'check-drift':
      return app.get(CheckDriftService).run();
  }
}

async function run(): Promise<unknown> {
  const subcommand = process.argv[2];
  if (!isSubcommand(subcommand)) {
    throw new Error(
      `Usage: node dist/main.js <${SUBCOMMANDS.join('|')}>` +
        (subcommand === undefined || subcommand === ''
          ? ''
          : ` (got '${subcommand}')`),
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    return await dispatch(app, subcommand);
  } finally {
    await app.close();
  }
}

run()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ error: message }));
    process.exit(1);
  });
