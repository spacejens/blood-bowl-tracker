#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { CheckDriftService } from './check-drift/check-drift.service';
import { CheckMainStrayService } from './check-main-stray/check-main-stray.service';
import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { PostReviewQuestionsService } from './post-review-questions/post-review-questions.service';
import {
  POST_REVIEW_QUESTIONS_USAGE,
  PostReviewQuestionsArgsService,
} from './post-review-questions/post-review-questions-args.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';
import { ResetProductionSchemaService } from './reset-production-schema/reset-production-schema.service';
import { RunProductionQueryService } from './run-production-query/run-production-query.service';
import { GitRootsService } from './shared/git-roots.service';
import { SyncGitignoredService } from './sync-gitignored/sync-gitignored.service';
import { WaitForPrReviewService } from './wait-for-pr-review/wait-for-pr-review.service';
import { WaitForPrReviewArgsService } from './wait-for-pr-review/wait-for-pr-review-args.service';
import { WriteFileService } from './write-file/write-file.service';

const SUBCOMMANDS = [
  'resolve-main-root',
  'check-main-stray',
  'sync-gitignored',
  'check-drift',
  'write-file',
  'wait-for-pr-review',
  'post-review-questions',
  'check-production-config-port',
  'start-production-tunnel',
  'stop-production-tunnel',
  'run-production-query',
  'reset-production-schema',
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(value: string | undefined): value is Subcommand {
  return SUBCOMMANDS.includes(value as Subcommand);
}

const WRITE_FILE_USAGE =
  'Usage: node dist/main.js write-file <repo-relative-path> ' +
  '(file content is read from stdin)';

const CHECK_PRODUCTION_CONFIG_PORT_USAGE =
  'Usage: node dist/main.js check-production-config-port <expected-api-base-url>';

const START_PRODUCTION_TUNNEL_USAGE =
  'Usage: node dist/main.js start-production-tunnel <local-port> <remote-port>';

const RUN_PRODUCTION_QUERY_USAGE =
  'Usage: node dist/main.js run-production-query ' +
  '(query text is read from stdin)';

/** Arguments for `write-file`; absent for every other subcommand. */
interface WriteFileInput {
  readonly path: string;
  readonly content: string;
}

/** Arguments for `start-production-tunnel`; absent for every other subcommand. */
interface StartProductionTunnelInput {
  readonly localPort: number;
  readonly remotePort: number;
}

interface DispatchOptions {
  readonly app: INestApplicationContext;
  readonly subcommand: Subcommand;
  readonly writeFile?: WriteFileInput;
  readonly expectedApiBaseUrl?: string;
  readonly startProductionTunnel?: StartProductionTunnelInput;
  readonly postReviewQuestionsStdin?: string;
  readonly runProductionQueryStdin?: string;
}

function readWriteFileInput(): WriteFileInput {
  const path = process.argv[3];
  if (path === undefined || path === '') {
    throw new Error(WRITE_FILE_USAGE);
  }
  // fd 0 is stdin: read it fully before the Nest context is created.
  return { path, content: readFileSync(0, 'utf8') };
}

function readExpectedApiBaseUrl(): string {
  const expectedApiBaseUrl = process.argv[3];
  if (expectedApiBaseUrl === undefined || expectedApiBaseUrl === '') {
    throw new Error(CHECK_PRODUCTION_CONFIG_PORT_USAGE);
  }
  return expectedApiBaseUrl;
}

function isValidPort(value: string | undefined): value is string {
  if (value === undefined || value === '') {
    return false;
  }
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function readStartProductionTunnelInput(): StartProductionTunnelInput {
  const localPortArg = process.argv[3];
  const remotePortArg = process.argv[4];
  if (!isValidPort(localPortArg) || !isValidPort(remotePortArg)) {
    throw new Error(START_PRODUCTION_TUNNEL_USAGE);
  }
  return { localPort: Number(localPortArg), remotePort: Number(remotePortArg) };
}

function readPostReviewQuestionsStdin(): string {
  // fd 0 is stdin: read it fully before the Nest context is created.
  return readFileSync(0, 'utf8');
}

function readRunProductionQueryStdin(): string {
  // fd 0 is stdin: read it fully before the Nest context is created.
  return readFileSync(0, 'utf8');
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
      const waitOptions = app
        .get(WaitForPrReviewArgsService)
        .parse(process.argv);
      return app.get(WaitForPrReviewService).run(waitOptions);
    }
    case 'post-review-questions': {
      if (options.postReviewQuestionsStdin === undefined) {
        throw new Error(POST_REVIEW_QUESTIONS_USAGE);
      }
      const postReviewQuestionsInput = app
        .get(PostReviewQuestionsArgsService)
        .parse(process.argv, options.postReviewQuestionsStdin);
      return app.get(PostReviewQuestionsService).run(postReviewQuestionsInput);
    }
    case 'check-production-config-port': {
      if (options.expectedApiBaseUrl === undefined) {
        throw new Error(CHECK_PRODUCTION_CONFIG_PORT_USAGE);
      }
      return app
        .get(CheckProductionConfigPortService)
        .run(options.expectedApiBaseUrl);
    }
    case 'start-production-tunnel': {
      if (options.startProductionTunnel === undefined) {
        throw new Error(START_PRODUCTION_TUNNEL_USAGE);
      }
      return app
        .get(ProductionTunnelService)
        .start(
          options.startProductionTunnel.localPort,
          options.startProductionTunnel.remotePort,
        );
    }
    case 'stop-production-tunnel':
      return app.get(ProductionTunnelService).stop();
    case 'run-production-query': {
      if (options.runProductionQueryStdin === undefined) {
        throw new Error(RUN_PRODUCTION_QUERY_USAGE);
      }
      return app
        .get(RunProductionQueryService)
        .run(options.runProductionQueryStdin);
    }
    case 'reset-production-schema':
      return app.get(ResetProductionSchemaService).run();
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
  const expectedApiBaseUrl =
    subcommand === 'check-production-config-port'
      ? readExpectedApiBaseUrl()
      : undefined;
  const startProductionTunnel =
    subcommand === 'start-production-tunnel'
      ? readStartProductionTunnelInput()
      : undefined;
  const postReviewQuestionsStdin =
    subcommand === 'post-review-questions'
      ? readPostReviewQuestionsStdin()
      : undefined;
  const runProductionQueryStdin =
    subcommand === 'run-production-query'
      ? readRunProductionQueryStdin()
      : undefined;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    return await dispatch({
      app,
      subcommand,
      writeFile,
      expectedApiBaseUrl,
      startProductionTunnel,
      postReviewQuestionsStdin,
      runProductionQueryStdin,
    });
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
