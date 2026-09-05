import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../database-timeout.service';
import type { ButtonCustomIdPrefix } from '../deepdive/button-custom-ids';
import { EntityComponentsService } from '../entity-components.service';

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
export const MAX_EXACT_TIE_REMAINDER = 10;

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
type TieRemainder = { type: 'exact'; count: number } | { type: 'approximate' };

/** How a leaderboard row turns into a drill-down link: routing prefix plus the row's entity id. */
export interface EntityLink<T> {
  customIdPrefix: ButtonCustomIdPrefix;
  entityId: (row: T) => number | string;
  /**
   * Text shown on the drill-down button/select option. Defaults to `row.name`.
   * Override when the name alone is ambiguous — e.g. positions, whose names
   * repeat across races.
   */
  label?: (row: T) => string;
}

export interface RankedRows<T> {
  rows: (T & { rank: number })[];
  truncatedCount: number;
  tieGroupOpenEnded: boolean;
}

export interface FormatLeaderboardEmbedOptions<T> {
  title: string;
  rankedRows: T[];
  noDataMessage: string;
  tieRemainder?: TieRemainder;
  entityLink?: EntityLink<T>;
  formatRow?: (row: T) => string;
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
  entityLink?: EntityLink<T>;
  formatRow?: (row: T & { rank: number }) => string;
}

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
  ) {}

  topRanksWithTies<T extends { count: number }>(
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
    let boundaryTieBroken = false;
    for (const row of rows) {
      if (previousCount === null || row.count !== previousCount) {
        rank += 1;
        previousCount = row.count;
      }
      position += 1;
      if (boundaryValue !== null && row.count !== boundaryValue) {
        boundaryTieBroken = true;
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
    const tieGroupOpenEnded = boundaryValue !== null && !boundaryTieBroken;
    return { rows: ranked, truncatedCount, tieGroupOpenEnded };
  }

  formatLeaderboardEmbed<
    T extends { name: string; count: number; rank: number },
  >({
    title,
    rankedRows,
    noDataMessage,
    tieRemainder = { type: 'exact', count: 0 },
    entityLink,
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
    if (entityLink === undefined) {
      return { embeds: [{ title, description: lines.join('\n') }] };
    }
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(
        rankedRows.map((row) => ({
          customIdPrefix: entityLink.customIdPrefix,
          entityId: String(entityLink.entityId(row)),
          label: (entityLink.label ?? ((r) => r.name))(row),
        })),
      );
    if (overflowNote !== null) {
      lines.push(overflowNote);
    }
    return {
      embeds: [{ title, description: lines.join('\n') }],
      components,
    };
  }

  async resolveToplist<T extends { name: string; count: number }>({
    title,
    fetchRows,
    timeoutMessage,
    noDataMessage,
    entityLink,
    formatRow,
  }: ResolveToplistOptions<T>): Promise<string | InteractionReplyOptions> {
    const rows = await this.databaseTimeout.run<T[] | null>(
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
    const {
      rows: ranked,
      truncatedCount,
      tieGroupOpenEnded,
    } = this.topRanksWithTies(
      consideredRows,
      MAX_LEADERBOARD_TOP_ENTRIES,
      MAX_LEADERBOARD_ENTRIES,
    );
    // Only "lots more tied" when the fetch was saturated AND the boundary tie
    // was still open at the window edge; a saturated fetch whose boundary tie
    // resolves inside the window can still report an exact remainder.
    const tieRemainder: TieRemainder =
      saturated && tieGroupOpenEnded
        ? { type: 'approximate' }
        : { type: 'exact', count: truncatedCount };
    return this.formatLeaderboardEmbed({
      title,
      rankedRows: ranked,
      noDataMessage,
      tieRemainder,
      entityLink,
      formatRow,
    });
  }
}
