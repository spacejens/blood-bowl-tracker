#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { runCli } from '@blood-bowl-tracker/cli-shared';
import { INestApplicationContext } from '@nestjs/common';

import { AppModule } from './app.module';
import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { FetchDiscordMessageService } from './fetch-discord-message/fetch-discord-message.service';
import {
  FetchRecentDiscordMessagesService,
  MAX_COUNT,
  MIN_COUNT,
} from './fetch-recent-discord-messages/fetch-recent-discord-messages.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';
import { ResetProductionSchemaService } from './reset-production-schema/reset-production-schema.service';
import { RunProductionQueryService } from './run-production-query/run-production-query.service';

const SUBCOMMANDS = [
  'check-production-config-port',
  'start-production-tunnel',
  'stop-production-tunnel',
  'run-production-query',
  'reset-production-schema',
  'fetch-recent-discord-messages',
  'fetch-discord-message',
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

const CHECK_PRODUCTION_CONFIG_PORT_USAGE =
  'Usage: node dist/main.js check-production-config-port <expected-api-base-url>';

const START_PRODUCTION_TUNNEL_USAGE =
  'Usage: node dist/main.js start-production-tunnel <local-port> <remote-port>';

const RUN_PRODUCTION_QUERY_USAGE =
  'Usage: node dist/main.js run-production-query ' +
  '(query text is read from stdin)';

const FETCH_RECENT_DISCORD_MESSAGES_USAGE =
  'Usage: node dist/main.js fetch-recent-discord-messages ' +
  `<channel-id> <count> (count is ${MIN_COUNT}-${MAX_COUNT})`;

const FETCH_DISCORD_MESSAGE_USAGE =
  'Usage: node dist/main.js fetch-discord-message ' +
  'https://discord.com/channels/<guild-id>/<channel-id>/<message-id>';

/** Arguments for `start-production-tunnel`; absent for every other subcommand. */
interface StartProductionTunnelInput {
  readonly localPort: number;
  readonly remotePort: number;
}

/** Arguments for `fetch-recent-discord-messages`; absent otherwise. */
interface FetchRecentDiscordMessagesInput {
  readonly channelId: string;
  readonly count: number;
}

interface DispatchArgs {
  readonly expectedApiBaseUrl?: string;
  readonly startProductionTunnel?: StartProductionTunnelInput;
  readonly runProductionQueryStdin?: string;
  readonly fetchRecentDiscordMessages?: FetchRecentDiscordMessagesInput;
  readonly discordMessageLink?: string;
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

/** Mirrors `isValidPort`: the range check lives beside argument reading. */
function isValidMessageCount(value: string | undefined): value is string {
  if (value === undefined || value === '') {
    return false;
  }
  const count = Number(value);
  return Number.isInteger(count) && count >= MIN_COUNT && count <= MAX_COUNT;
}

function readFetchRecentDiscordMessagesInput(): FetchRecentDiscordMessagesInput {
  const channelId = process.argv[3];
  const countArg = process.argv[4];
  if (
    channelId === undefined ||
    channelId === '' ||
    !isValidMessageCount(countArg)
  ) {
    throw new Error(FETCH_RECENT_DISCORD_MESSAGES_USAGE);
  }
  return { channelId, count: Number(countArg) };
}

function readDiscordMessageLink(): string {
  const messageLink = process.argv[3];
  if (messageLink === undefined || messageLink === '') {
    throw new Error(FETCH_DISCORD_MESSAGE_USAGE);
  }
  return messageLink;
}

function readArgs(subcommand: Subcommand): DispatchArgs {
  return {
    expectedApiBaseUrl:
      subcommand === 'check-production-config-port'
        ? readExpectedApiBaseUrl()
        : undefined,
    startProductionTunnel:
      subcommand === 'start-production-tunnel'
        ? readStartProductionTunnelInput()
        : undefined,
    runProductionQueryStdin:
      subcommand === 'run-production-query'
        ? readRunProductionQueryStdin()
        : undefined,
    fetchRecentDiscordMessages:
      subcommand === 'fetch-recent-discord-messages'
        ? readFetchRecentDiscordMessagesInput()
        : undefined,
    discordMessageLink:
      subcommand === 'fetch-discord-message'
        ? readDiscordMessageLink()
        : undefined,
  };
}

function dispatch(
  app: INestApplicationContext,
  subcommand: Subcommand,
  args: DispatchArgs,
): Promise<unknown> {
  switch (subcommand) {
    case 'check-production-config-port': {
      if (args.expectedApiBaseUrl === undefined) {
        throw new Error(CHECK_PRODUCTION_CONFIG_PORT_USAGE);
      }
      return app
        .get(CheckProductionConfigPortService)
        .run(args.expectedApiBaseUrl);
    }
    case 'start-production-tunnel': {
      if (args.startProductionTunnel === undefined) {
        throw new Error(START_PRODUCTION_TUNNEL_USAGE);
      }
      return app
        .get(ProductionTunnelService)
        .start(
          args.startProductionTunnel.localPort,
          args.startProductionTunnel.remotePort,
        );
    }
    case 'stop-production-tunnel':
      return app.get(ProductionTunnelService).stop();
    case 'run-production-query': {
      if (args.runProductionQueryStdin === undefined) {
        throw new Error(RUN_PRODUCTION_QUERY_USAGE);
      }
      return app
        .get(RunProductionQueryService)
        .run(args.runProductionQueryStdin);
    }
    case 'reset-production-schema':
      return app.get(ResetProductionSchemaService).run();
    case 'fetch-recent-discord-messages': {
      if (args.fetchRecentDiscordMessages === undefined) {
        throw new Error(FETCH_RECENT_DISCORD_MESSAGES_USAGE);
      }
      return app
        .get(FetchRecentDiscordMessagesService)
        .run(
          args.fetchRecentDiscordMessages.channelId,
          args.fetchRecentDiscordMessages.count,
        );
    }
    case 'fetch-discord-message': {
      if (args.discordMessageLink === undefined) {
        throw new Error(FETCH_DISCORD_MESSAGE_USAGE);
      }
      return app.get(FetchDiscordMessageService).run(args.discordMessageLink);
    }
  }
}

void runCli({
  argv: process.argv,
  subcommands: SUBCOMMANDS,
  module: AppModule,
  readArgs,
  dispatch,
});
