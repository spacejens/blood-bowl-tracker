#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';
import { ResetProductionSchemaService } from './reset-production-schema/reset-production-schema.service';
import { RunProductionQueryService } from './run-production-query/run-production-query.service';

const SUBCOMMANDS = [
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

const CHECK_PRODUCTION_CONFIG_PORT_USAGE =
  'Usage: node dist/main.js check-production-config-port <expected-api-base-url>';

const START_PRODUCTION_TUNNEL_USAGE =
  'Usage: node dist/main.js start-production-tunnel <local-port> <remote-port>';

const RUN_PRODUCTION_QUERY_USAGE =
  'Usage: node dist/main.js run-production-query ' +
  '(query text is read from stdin)';

/** Arguments for `start-production-tunnel`; absent for every other subcommand. */
interface StartProductionTunnelInput {
  readonly localPort: number;
  readonly remotePort: number;
}

interface DispatchOptions {
  readonly app: INestApplicationContext;
  readonly subcommand: Subcommand;
  readonly expectedApiBaseUrl?: string;
  readonly startProductionTunnel?: StartProductionTunnelInput;
  readonly runProductionQueryStdin?: string;
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

function readRunProductionQueryStdin(): string {
  // fd 0 is stdin: read it fully before the Nest context is created.
  return readFileSync(0, 'utf8');
}

function dispatch(options: DispatchOptions): Promise<unknown> {
  const { app, subcommand } = options;
  switch (subcommand) {
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

  const expectedApiBaseUrl =
    subcommand === 'check-production-config-port'
      ? readExpectedApiBaseUrl()
      : undefined;
  const startProductionTunnel =
    subcommand === 'start-production-tunnel'
      ? readStartProductionTunnelInput()
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
      expectedApiBaseUrl,
      startProductionTunnel,
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
