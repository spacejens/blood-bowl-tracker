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

/**
 * Largest tie-group remainder rendered as an exact count; past this the
 * remainder is shown as an approximate "lots more tied" instead.
 */
const MAX_EXACT_TIE_REMAINDER = 10;

/**
 * Rows requested from toplist queries: enough to show MAX_LEADERBOARD_ENTRIES
 * ranked rows, report an exact tied remainder up to MAX_EXACT_TIE_REMAINDER,
 * and fetch one extra sentinel row to detect when the true result set is larger
 * than this window (in which case the remainder can no longer be counted
 * exactly).
 */
export const TOPLIST_FETCH_LIMIT =
  MAX_LEADERBOARD_ENTRIES + MAX_EXACT_TIE_REMAINDER + 1;

/**
 * How large the "…and N more tied." remainder is. `exact` carries the counted
 * number (0 means no remainder line); `approximate` means the fetch window was
 * saturated so the true remainder is unknown and rendered as "lots more tied".
 */
export type TieRemainder =
  { type: 'exact'; count: number } | { type: 'approximate' };

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
  tieRemainder?: TieRemainder;
  buildCustomId?: (row: T) => string;
  formatRow?: (row: T) => string;
}

export function formatLeaderboardEmbed<
  T extends { name: string; count: number; rank: number },
>({
  title,
  rankedRows,
  noDataMessage,
  tieRemainder = { type: 'exact', count: 0 },
  buildCustomId,
  formatRow = (row) => `${row.rank}. ${row.name} — ${row.count}`,
}: FormatLeaderboardEmbedOptions<T>): InteractionReplyOptions {
  if (rankedRows.length === 0) {
    return { embeds: [{ title, description: noDataMessage }] };
  }
  const lines = rankedRows.map(formatRow);
  if (tieRemainder.type === 'approximate') {
    lines.push('…and lots more tied.');
  } else if (tieRemainder.count > 0) {
    lines.push(`…and ${tieRemainder.count} more tied.`);
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
  fetchRows: (limit: number) => Promise<T[]>;
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
  const rows = await withDatabaseTimeout<T[] | null>(
    fetchRows(TOPLIST_FETCH_LIMIT),
    null,
  );
  if (rows === null) {
    return timeoutMessage;
  }
  // A full fetch means the true result set is at least one row larger than the
  // window; drop that sentinel row and report the remainder as approximate,
  // because we can no longer count it exactly.
  const saturated = rows.length === TOPLIST_FETCH_LIMIT;
  const consideredRows = saturated ? rows.slice(0, -1) : rows;
  const { rows: ranked, truncatedCount } = topRanksWithTies(
    consideredRows,
    MAX_LEADERBOARD_TOP_ENTRIES,
    MAX_LEADERBOARD_ENTRIES,
  );
  const tieRemainder: TieRemainder = saturated
    ? { type: 'approximate' }
    : { type: 'exact', count: truncatedCount };
  return formatLeaderboardEmbed({
    title,
    rankedRows: ranked,
    noDataMessage,
    tieRemainder,
    buildCustomId,
    formatRow,
  });
}
