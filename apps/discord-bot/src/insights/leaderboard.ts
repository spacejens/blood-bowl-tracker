// apps/discord-bot/src/insights/leaderboard.ts (temporary shim, removed in Task 8)
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../database-timeout.service';
import type {
  EntityButtonRow,
  FormatLeaderboardEmbedOptions,
  RankedRows,
  ResolveToplistOptions,
} from './leaderboard.service';
import { LeaderboardService } from './leaderboard.service';

export * from './leaderboard.service';

const shared = new LeaderboardService(new DatabaseTimeoutService());

export function topRanksWithTies<T extends { count: number }>(
  rows: T[],
  topEntries: number,
  maxEntries?: number,
): RankedRows<T> {
  return shared.topRanksWithTies(rows, topEntries, maxEntries);
}

export function buildEntityButtons<T>(
  rows: T[],
  buildCustomId: (row: T) => string,
  label: (row: T) => string,
): EntityButtonRow[] {
  return shared.buildEntityButtons(rows, buildCustomId, label);
}

export function formatLeaderboardEmbed<
  T extends { name: string; count: number; rank: number },
>(options: FormatLeaderboardEmbedOptions<T>): InteractionReplyOptions {
  return shared.formatLeaderboardEmbed(options);
}

export function resolveToplist<T extends { name: string; count: number }>(
  options: ResolveToplistOptions<T>,
): Promise<string | InteractionReplyOptions> {
  return shared.resolveToplist(options);
}
