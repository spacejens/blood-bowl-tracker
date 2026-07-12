import type { InteractionReplyOptions } from 'discord.js';

import {
  DATABASE_TIMEOUT_FALLBACK_MESSAGE,
  withDatabaseTimeout,
} from '../database-timeout';

export function topRanksWithTies<T extends { count: number }>(
  rows: T[],
  maxRank: number,
): (T & { rank: number })[] {
  const ranked: (T & { rank: number })[] = [];
  let rank = 0;
  let previousCount: number | null = null;
  for (const row of rows) {
    if (previousCount === null || row.count !== previousCount) {
      rank += 1;
      previousCount = row.count;
    }
    if (rank > maxRank) {
      break;
    }
    ranked.push({ ...row, rank });
  }
  return ranked;
}

export function formatLeaderboardEmbed<
  T extends { name: string; count: number; rank: number },
>(title: string, rankedRows: T[]): InteractionReplyOptions {
  const description =
    rankedRows.length === 0
      ? 'No data recorded yet.'
      : rankedRows
          .map((row) => `${row.rank}. ${row.name} — ${row.count}`)
          .join('\n');
  return { embeds: [{ title, description }] };
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
  return formatLeaderboardEmbed(title, topRanksWithTies(rows, 5));
}
