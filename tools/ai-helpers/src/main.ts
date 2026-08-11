#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { CheckDriftService } from './check-drift/check-drift.service';
import { CheckMainStrayService } from './check-main-stray/check-main-stray.service';
import { GitRootsService } from './shared/git-roots.service';
import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';
import {
  WaitForPrReviewOptions,
  WaitForPrReviewService,
} from './wait-for-pr-review/wait-for-pr-review.service';
import { WriteFileService } from './write-file/write-file.service';

const SUBCOMMANDS = [
  'resolve-main-root',
  'check-main-stray',
  'sync-gitignored',
  'check-drift',
  'write-file',
  'wait-for-pr-review',
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(value: string | undefined): value is Subcommand {
  return SUBCOMMANDS.includes(value as Subcommand);
}

const WRITE_FILE_USAGE =
  'Usage: node dist/main.js write-file <repo-relative-path> ' +
  '(file content is read from stdin)';

/** Arguments for `write-file`; absent for every other subcommand. */
interface WriteFileInput {
  readonly path: string;
  readonly content: string;
}

const WAIT_FOR_PR_REVIEW_USAGE =
  'Usage: node dist/main.js wait-for-pr-review <pr-number> ' +
  '<developer-login> <since-epoch-seconds> ' +
  '[--timeout-ms=600000] [--interval-ms=30000] [--exclude-review-id=<id>]';

/** Below this, `--interval-ms` would hammer `gh` in a tight loop. */
const MIN_INTERVAL_MS = 1000;

/** Reads `--<name>=<value>` from the flags region of argv; undefined when absent. */
function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const flag = process.argv.slice(6).find((arg) => arg.startsWith(prefix));
  return flag === undefined ? undefined : flag.slice(prefix.length);
}

/** Reads `--<name>=<integer>`; undefined when the flag is absent. */
function readMsFlag(name: string, minimum: number): number | undefined {
  const raw = readFlag(name);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${WAIT_FOR_PR_REVIEW_USAGE} (bad --${name} value)`);
  }
  return value;
}

function readWaitForPrReviewInput(): WaitForPrReviewOptions {
  const prNumber = process.argv[3];
  const developerLogin = process.argv[4];
  const sinceEpochSeconds = Number(process.argv[5]);
  if (
    prNumber === undefined ||
    !/^[1-9]\d*$/.test(prNumber) ||
    developerLogin === undefined ||
    developerLogin === '' ||
    !Number.isInteger(sinceEpochSeconds)
  ) {
    throw new Error(WAIT_FOR_PR_REVIEW_USAGE);
  }
  const excludeReviewId = readFlag('exclude-review-id');
  return {
    prNumber,
    developerLogin,
    sinceEpochSeconds,
    timeoutMs: readMsFlag('timeout-ms', 0),
    intervalMs: readMsFlag('interval-ms', MIN_INTERVAL_MS),
    ...(excludeReviewId === undefined ? {} : { excludeReviewId }),
  };
}

interface DispatchOptions {
  readonly app: INestApplicationContext;
  readonly subcommand: Subcommand;
  readonly writeFile?: WriteFileInput;
  readonly waitForPrReview?: WaitForPrReviewOptions;
}

function readWriteFileInput(): WriteFileInput {
  const path = process.argv[3];
  if (path === undefined || path === '') {
    throw new Error(WRITE_FILE_USAGE);
  }
  // fd 0 is stdin: read it fully before the Nest context is created.
  return { path, content: readFileSync(0, 'utf8') };
}

function dispatch(options: DispatchOptions): Promise<unknown> {
  const { app, subcommand } = options;
  switch (subcommand) {
    case 'resolve-main-root':
      return app.get(GitRootsService).resolve();
    case 'check-main-stray':
      return app.get(CheckMainStrayService).run();
    case 'sync-gitignored':
      return app.get(SyncGitignoredService).run();
    case 'check-drift':
      return app.get(CheckDriftService).run();
    case 'write-file': {
      if (options.writeFile === undefined) {
        throw new Error(WRITE_FILE_USAGE);
      }
      return app
        .get(WriteFileService)
        .run(options.writeFile.path, options.writeFile.content);
    }
    case 'wait-for-pr-review': {
      if (options.waitForPrReview === undefined) {
        throw new Error(WAIT_FOR_PR_REVIEW_USAGE);
      }
      return app.get(WaitForPrReviewService).run(options.waitForPrReview);
    }
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

  const writeFile =
    subcommand === 'write-file' ? readWriteFileInput() : undefined;
  const waitForPrReview =
    subcommand === 'wait-for-pr-review'
      ? readWaitForPrReviewInput()
      : undefined;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    return await dispatch({ app, subcommand, writeFile, waitForPrReview });
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
