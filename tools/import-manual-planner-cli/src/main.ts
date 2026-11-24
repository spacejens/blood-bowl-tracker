#!/usr/bin/env node

import { runCli } from '@blood-bowl-tracker/cli-shared';
import { INestApplicationContext } from '@nestjs/common';

import { AppModule } from './app.module';
import {
  type GenerateIncompletePlayerFillsInput,
  GenerateIncompletePlayerFillsService,
} from './generate-incomplete-player-fills/generate-incomplete-player-fills.service';
import { ReadTpFeedHistoryService } from './read-tp-feed-history/read-tp-feed-history.service';
import { ReadTpRosterSnapshotsService } from './read-tp-roster-snapshots/read-tp-roster-snapshots.service';

const SUBCOMMANDS = [
  'generate-incomplete-player-fills',
  'read-tp-feed-history',
  'read-tp-roster-snapshots',
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

const GENERATE_INCOMPLETE_PLAYER_FILLS_USAGE =
  'Usage: node dist/main.js generate-incomplete-player-fills ' +
  '[--out=<repo-relative-path>] [--feed-channel=<channel-id>] [--snapshots]';
const READ_TP_FEED_HISTORY_USAGE =
  'Usage: node dist/main.js read-tp-feed-history <channel-id> [--max-pages=N]';

const READ_TP_ROSTER_SNAPSHOTS_USAGE =
  'Usage: node dist/main.js read-tp-roster-snapshots (no arguments)';

const MAX_PAGES_FLAG = '--max-pages=';
const OUT_FLAG = '--out=';
const FEED_CHANNEL_FLAG = '--feed-channel=';
const SNAPSHOTS_FLAG = '--snapshots';

/** Arguments for `read-tp-feed-history`; absent otherwise. */
interface ReadTpFeedHistoryInput {
  readonly channelId: string;
  readonly maxPages?: number;
}

interface DispatchArgs {
  readonly generateIncompletePlayerFills?: GenerateIncompletePlayerFillsInput;
  readonly readTpFeedHistory?: ReadTpFeedHistoryInput;
  readonly readTpRosterSnapshots?: true;
}

/** Each flag at most once, in any order; the channel id must be all digits. */
function readGenerateIncompletePlayerFillsInput(): GenerateIncompletePlayerFillsInput {
  let out: string | undefined;
  let feedChannel: string | undefined;
  let snapshots: true | undefined;
  for (const arg of process.argv.slice(3)) {
    if (
      out === undefined &&
      arg.startsWith(OUT_FLAG) &&
      arg.length > OUT_FLAG.length
    ) {
      out = arg.slice(OUT_FLAG.length);
    } else if (
      feedChannel === undefined &&
      arg.startsWith(FEED_CHANNEL_FLAG) &&
      /^\d+$/u.test(arg.slice(FEED_CHANNEL_FLAG.length))
    ) {
      feedChannel = arg.slice(FEED_CHANNEL_FLAG.length);
    } else if (snapshots === undefined && arg === SNAPSHOTS_FLAG) {
      snapshots = true;
    } else {
      throw new Error(GENERATE_INCOMPLETE_PLAYER_FILLS_USAGE);
    }
  }
  return {
    ...(out === undefined ? {} : { out }),
    ...(feedChannel === undefined ? {} : { feedChannel }),
    ...(snapshots === undefined ? {} : { snapshots }),
  };
}

/** The subcommand takes no arguments. */
function readReadTpRosterSnapshotsInput(): true {
  if (process.argv.length > 3) {
    throw new Error(READ_TP_ROSTER_SNAPSHOTS_USAGE);
  }
  return true;
}

/**
 * Reads only the argument syntax; the service itself checks that the channel
 * id is a snowflake and the page count a positive integer.
 */
function readReadTpFeedHistoryInput(): ReadTpFeedHistoryInput {
  const channelId = process.argv[3];
  const maxPagesArg = process.argv[4];
  if (channelId === undefined || channelId === '' || process.argv.length > 5) {
    throw new Error(READ_TP_FEED_HISTORY_USAGE);
  }
  if (maxPagesArg === undefined) {
    return { channelId };
  }
  const pages = maxPagesArg.startsWith(MAX_PAGES_FLAG)
    ? maxPagesArg.slice(MAX_PAGES_FLAG.length)
    : '';
  if (!/^\d+$/u.test(pages)) {
    throw new Error(READ_TP_FEED_HISTORY_USAGE);
  }
  return { channelId, maxPages: Number(pages) };
}

function readArgs(subcommand: Subcommand): DispatchArgs {
  return {
    generateIncompletePlayerFills:
      subcommand === 'generate-incomplete-player-fills'
        ? readGenerateIncompletePlayerFillsInput()
        : undefined,
    readTpFeedHistory:
      subcommand === 'read-tp-feed-history'
        ? readReadTpFeedHistoryInput()
        : undefined,
    readTpRosterSnapshots:
      subcommand === 'read-tp-roster-snapshots'
        ? readReadTpRosterSnapshotsInput()
        : undefined,
  };
}

function dispatch(
  app: INestApplicationContext,
  subcommand: Subcommand,
  args: DispatchArgs,
): Promise<unknown> {
  switch (subcommand) {
    case 'generate-incomplete-player-fills': {
      if (args.generateIncompletePlayerFills === undefined) {
        throw new Error(GENERATE_INCOMPLETE_PLAYER_FILLS_USAGE);
      }
      return app
        .get(GenerateIncompletePlayerFillsService)
        .run(args.generateIncompletePlayerFills);
    }
    case 'read-tp-feed-history': {
      if (args.readTpFeedHistory === undefined) {
        throw new Error(READ_TP_FEED_HISTORY_USAGE);
      }
      return app
        .get(ReadTpFeedHistoryService)
        .run(args.readTpFeedHistory.channelId, args.readTpFeedHistory.maxPages);
    }
    case 'read-tp-roster-snapshots': {
      if (args.readTpRosterSnapshots === undefined) {
        throw new Error(READ_TP_ROSTER_SNAPSHOTS_USAGE);
      }
      return app.get(ReadTpRosterSnapshotsService).run();
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
