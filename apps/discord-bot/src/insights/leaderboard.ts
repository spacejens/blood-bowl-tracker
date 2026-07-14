import type { InteractionReplyOptions } from 'discord.js';

import {
  DATABASE_TIMEOUT_FALLBACK_MESSAGE,
  withDatabaseTimeout,
} from '../database-timeout';

/**
 * Discord caps an embed description at 4096 characters. A tie group can be
 * far larger than any reasonable rank cutoff (e.g. most teams sharing the
 * same "eras active" count), so entries are also hard-capped independent of
 * rank/tie grouping to keep the rendered description well within that limit.
 */
const MAX_LEADERBOARD_ENTRIES = 50;

export interface RankedRows<T> {
  rows: (T & { rank: number })[];
  truncatedCount: number;
}

export function topRanksWithTies<T extends { count: number }>(
  rows: T[],
  maxRank: number,
  maxEntries: number = MAX_LEADERBOARD_ENTRIES,
): RankedRows<T> {
  const ranked: (T & { rank: number })[] = [];
  let rank = 0;
  let previousCount: number | null = null;
  let truncatedCount = 0;
  for (const row of rows) {
    if (previousCount === null || row.count !== previousCount) {
      rank += 1;
      previousCount = row.count;
    }
    if (rank > maxRank) {
      break;
    }
    if (ranked.length >= maxEntries) {
      truncatedCount += 1;
      continue;
    }
    ranked.push({ ...row, rank });
  }
  return { rows: ranked, truncatedCount };
}

export function formatLeaderboardEmbed<
  T extends { name: string; count: number; rank: number },
>(title: string, rankedRows: T[], truncatedCount = 0): InteractionReplyOptions {
  if (rankedRows.length === 0) {
    return { embeds: [{ title, description: 'No data recorded yet.' }] };
  }
  const lines = rankedRows.map(
    (row) => `${row.rank}. ${row.name} — ${row.count}`,
  );
  if (truncatedCount > 0) {
    lines.push(`…and ${truncatedCount} more tied.`);
  }
  return { embeds: [{ title, description: lines.join('\n') }] };
}

/**
 * Shared shape for the fact resolvers backing the `/insights` toplist facts:
 * run `fetchRows` under the database timeout, and either fall back to the
 * standard timeout message or format the top-ranked rows as a leaderboard
 * embed.
 */
export async function resolveToplist<T extends { name: string; count: number }>(
  title: string,
  fetchRows: () => Promise<T[]>,
): Promise<string | InteractionReplyOptions> {
  const rows = await withDatabaseTimeout<T[] | null>(fetchRows(), null);
  if (rows === null) {
    return DATABASE_TIMEOUT_FALLBACK_MESSAGE;
  }
  const { rows: ranked, truncatedCount } = topRanksWithTies(rows, 5);
  return formatLeaderboardEmbed(title, ranked, truncatedCount);
}
