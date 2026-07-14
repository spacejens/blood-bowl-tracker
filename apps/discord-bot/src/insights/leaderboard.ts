import type { InteractionReplyOptions } from 'discord.js';

import {
  DATABASE_TIMEOUT_FALLBACK_MESSAGE,
  withDatabaseTimeout,
} from '../database-timeout';

/**
 * A tie group can be far larger than the top-N cutoff (e.g. most teams sharing
 * the same "eras active" count). Rendering the entire group would be an
 * unreadable wall of near-identical rows, so entries are hard-capped
 * independent of rank/tie grouping; the remainder is summarized as
 * "…and NN more tied.".
 */
const MAX_LEADERBOARD_ENTRIES = 10;

/**
 * The leaderboard always shows at least this many entries by position (not by
 * distinct count value). If the entry at this position ties with later entries,
 * the full tie group is shown, up to MAX_LEADERBOARD_ENTRIES.
 */
const MAX_LEADERBOARD_TOP_ENTRIES = 5;

export interface RankedRows<T> {
  rows: (T & { rank: number })[];
  truncatedCount: number;
}

export function topRanksWithTies<T extends { count: number }>(
  rows: T[],
  topEntries: number,
  maxEntries: number = MAX_LEADERBOARD_ENTRIES,
): RankedRows<T> {
  const ranked: (T & { rank: number })[] = [];
  let rank = 0;
  let previousCount: number | null = null;
  let truncatedCount = 0;
  let position = 0;
  let boundaryValue: number | null = null;
  for (const row of rows) {
    if (previousCount === null || row.count !== previousCount) {
      rank += 1;
      previousCount = row.count;
    }
    position += 1;
    if (boundaryValue !== null && row.count !== boundaryValue) {
      break;
    }
    if (ranked.length >= maxEntries) {
      truncatedCount += 1;
    } else {
      ranked.push({ ...row, rank });
    }
    if (position === topEntries) {
      boundaryValue = row.count;
    }
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
  const { rows: ranked, truncatedCount } = topRanksWithTies(
    rows,
    MAX_LEADERBOARD_TOP_ENTRIES,
    MAX_LEADERBOARD_ENTRIES,
  );
  return formatLeaderboardEmbed(title, ranked, truncatedCount);
}
