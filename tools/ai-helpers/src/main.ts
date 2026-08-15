#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { CheckDriftService } from './check-drift/check-drift.service';
import { CheckMainStrayService } from './check-main-stray/check-main-stray.service';
import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { PostDeferredFindingsService } from './post-deferred-findings/post-deferred-findings.service';
import {
  POST_DEFERRED_FINDINGS_USAGE,
  PostDeferredFindingsArgsService,
} from './post-deferred-findings/post-deferred-findings-args.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';
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
  'post-deferred-findings',
  'check-production-config-port',
  'start-production-tunnel',
  'stop-production-tunnel',
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
  readonly postDeferredFindingsStdin?: string;
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

function readPostDeferredFindingsStdin(): string {
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
    case 'post-deferred-findings': {
      if (options.postDeferredFindingsStdin === undefined) {
        throw new Error(POST_DEFERRED_FINDINGS_USAGE);
      }
      const postDeferredFindingsInput = app
        .get(PostDeferredFindingsArgsService)
        .parse(process.argv, options.postDeferredFindingsStdin);
      return app
        .get(PostDeferredFindingsService)
        .run(postDeferredFindingsInput);
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
  const postDeferredFindingsStdin =
    subcommand === 'post-deferred-findings'
      ? readPostDeferredFindingsStdin()
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
      postDeferredFindingsStdin,
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
