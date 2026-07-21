import type { InteractionReplyOptions } from 'discord.js';
import { ButtonStyle, ComponentType } from 'discord.js';

import { withDatabaseTimeout } from '../database-timeout';

/**
 * A tie group can be far larger than the top-N cutoff (e.g. most teams sharing
 * the same "eras active" count). Rendering the entire group would be an
 * unreadable wall of near-identical rows, so entries are hard-capped
 * independent of rank/tie grouping; the remainder is summarized as
 * "…and NN more tied.".
 */
export const MAX_LEADERBOARD_ENTRIES = 10;

/**
 * The leaderboard always shows at least this many entries by position (not by
 * distinct count value). If the entry at this position ties with later entries,
 * the full tie group is shown, up to MAX_LEADERBOARD_ENTRIES.
 */
const MAX_LEADERBOARD_TOP_ENTRIES = 5;

/** Discord allows at most 5 buttons per action row and 5 rows per message. */
const MAX_BUTTONS_PER_ROW = 5;
const MAX_BUTTON_ROWS = 5;
const MAX_BUTTONS = MAX_BUTTONS_PER_ROW * MAX_BUTTON_ROWS;

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

export interface FormatLeaderboardEmbedOptions<T> {
  title: string;
  rankedRows: T[];
  noDataMessage: string;
  truncatedCount?: number;
  buildCustomId?: (row: T) => string;
  formatRow?: (row: T) => string;
}

export function formatLeaderboardEmbed<
  T extends { name: string; count: number; rank: number },
>({
  title,
  rankedRows,
  noDataMessage,
  truncatedCount = 0,
  buildCustomId,
  formatRow = (row) => `${row.rank}. ${row.name} — ${row.count}`,
}: FormatLeaderboardEmbedOptions<T>): InteractionReplyOptions {
  if (rankedRows.length === 0) {
    return { embeds: [{ title, description: noDataMessage }] };
  }
  const lines = rankedRows.map(formatRow);
  if (truncatedCount > 0) {
    lines.push(`…and ${truncatedCount} more tied.`);
  }
  const embed = { embeds: [{ title, description: lines.join('\n') }] };
  if (buildCustomId === undefined) {
    return embed;
  }
  // A row may repeat a team (e.g. the biggest-mistakes list), but Discord
  // rejects duplicate button custom_ids — keep only the first occurrence.
  const seen = new Set<string>();
  const buttons = rankedRows
    .filter((row) => {
      const customId = buildCustomId(row);
      if (seen.has(customId)) {
        return false;
      }
      seen.add(customId);
      return true;
    })
    .slice(0, MAX_BUTTONS)
    .map((row) => ({
      type: ComponentType.Button as const,
      style: ButtonStyle.Primary as const,
      label: row.name,
      custom_id: buildCustomId(row),
    }));
  const components: {
    type: ComponentType.ActionRow;
    components: typeof buttons;
  }[] = [];
  for (let i = 0; i < buttons.length; i += MAX_BUTTONS_PER_ROW) {
    components.push({
      type: ComponentType.ActionRow as const,
      components: buttons.slice(i, i + MAX_BUTTONS_PER_ROW),
    });
  }
  return { ...embed, components };
}

/**
 * Shared shape for the fact resolvers backing the `/insights` toplist facts:
 * run `fetchRows` under the database timeout, and either fall back to
 * `timeoutMessage` or format the rows (using `noDataMessage` for an empty
 * result) as a leaderboard embed.
 */
export interface ResolveToplistOptions<T> {
  title: string;
  fetchRows: () => Promise<T[]>;
  timeoutMessage: string;
  noDataMessage: string;
  buildCustomId?: (row: T) => string;
  formatRow?: (row: T & { rank: number }) => string;
}

export async function resolveToplist<
  T extends { name: string; count: number },
>({
  title,
  fetchRows,
  timeoutMessage,
  noDataMessage,
  buildCustomId,
  formatRow,
}: ResolveToplistOptions<T>): Promise<string | InteractionReplyOptions> {
  const rows = await withDatabaseTimeout<T[] | null>(fetchRows(), null);
  if (rows === null) {
    return timeoutMessage;
  }
  const { rows: ranked, truncatedCount } = topRanksWithTies(
    rows,
    MAX_LEADERBOARD_TOP_ENTRIES,
    MAX_LEADERBOARD_ENTRIES,
  );
  return formatLeaderboardEmbed({
    title,
    rankedRows: ranked,
    noDataMessage,
    truncatedCount,
    buildCustomId,
    formatRow,
  });
}
