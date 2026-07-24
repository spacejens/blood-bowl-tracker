import type { InteractionReplyOptions } from 'discord.js';
import { ButtonStyle, ComponentType } from 'discord.js';
import { expect, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type {
  EntityButtonRow,
  RankedRows,
  ResolveToplistOptions,
} from '../leaderboard.service';
import {
  LeaderboardService,
  MAX_LEADERBOARD_ENTRIES,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';

/** Discord allows at most 5 buttons per action row and 5 rows per message. */
const MAX_BUTTONS_PER_ROW = 5;
const MAX_BUTTON_ROWS = 5;
const MAX_BUTTONS = MAX_BUTTONS_PER_ROW * MAX_BUTTON_ROWS;

/**
 * A `LeaderboardService` mock whose `resolveToplist` runs a minimal dense-rank
 * formatter — same rank/tie/button rules as the real implementation, without
 * the fetch-window truncation and "lots more tied" edge cases (none of the
 * per-fact toplist specs exercise those; they are covered directly by
 * `leaderboard.service.spec.ts`). This lets each fact-toplist spec assert on
 * what it actually owns — the title, the query call, `buildCustomId`, and
 * `formatRow` — without re-testing `LeaderboardService`'s own ranking logic,
 * and without wiring a real `LeaderboardService` instance into the spec.
 */
export function makeLeaderboardMock(): MockProxy<LeaderboardService> {
  const leaderboard = mock<LeaderboardService>();
  leaderboard.resolveToplist.mockImplementation(
    async <T extends { name: string; count: number }>(
      options: ResolveToplistOptions<T>,
    ): Promise<string | InteractionReplyOptions> => {
      const rows = await options.fetchRows(TOPLIST_FETCH_LIMIT);
      if (rows.length === 0) {
        return {
          embeds: [
            { title: options.title, description: options.noDataMessage },
          ],
        };
      }
      let rank = 0;
      let previousCount: number | null = null;
      const ranked = rows.map((row) => {
        if (previousCount === null || row.count !== previousCount) {
          rank += 1;
          previousCount = row.count;
        }
        return { ...row, rank };
      });
      const formatRow =
        options.formatRow ??
        ((row) => `${row.rank}. ${row.name} — ${row.count}`);
      const embed: InteractionReplyOptions = {
        embeds: [
          {
            title: options.title,
            description: ranked.map(formatRow).join('\n'),
          },
        ],
      };
      if (options.buildCustomId === undefined) {
        return embed;
      }
      const buildCustomId = options.buildCustomId;
      const seen = new Set<string>();
      const buttons = ranked
        .filter((row) => {
          const customId = buildCustomId(row);
          if (seen.has(customId)) {
            return false;
          }
          seen.add(customId);
          return true;
        })
        .map((row) => ({
          type: ComponentType.Button as const,
          style: ButtonStyle.Primary as const,
          label: row.name,
          custom_id: buildCustomId(row),
        }));
      return {
        ...embed,
        components: [
          { type: ComponentType.ActionRow as const, components: buttons },
        ],
      };
    },
  );
  return leaderboard;
}

/**
 * A `LeaderboardService` mock whose `topRanksWithTies` and `buildEntityButtons`
 * faithfully reproduce the real dense-rank / tie-boundary / button-dedupe
 * algorithms (unlike `makeLeaderboardMock()` above, these two methods take no
 * dependency on `databaseTimeout` and are exactly what the deepdive fact
 * services call, so a subset reimplementation would break the assertions this
 * migration must preserve). Used by the deepdive fact-service specs, which
 * assert on the fully rendered rank/tie/button output without wiring a real
 * `LeaderboardService` instance into the spec.
 */
export function makeDeepdiveLeaderboardMock(): MockProxy<LeaderboardService> {
  const leaderboard = mock<LeaderboardService>();
  leaderboard.topRanksWithTies.mockImplementation(
    <T extends { count: number }>(
      rows: T[],
      topEntries: number,
      maxEntries: number = MAX_LEADERBOARD_ENTRIES,
    ): RankedRows<T> => {
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
    },
  );
  leaderboard.buildEntityButtons.mockImplementation(
    <T>(
      rows: T[],
      buildCustomId: (row: T) => string,
      label: (row: T) => string,
    ): EntityButtonRow[] => {
      const seen = new Set<string>();
      const buttons = rows
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
          label: label(row),
          custom_id: buildCustomId(row),
        }));
      const actionRows: EntityButtonRow[] = [];
      for (let i = 0; i < buttons.length; i += MAX_BUTTONS_PER_ROW) {
        actionRows.push({
          type: ComponentType.ActionRow as const,
          components: buttons.slice(i, i + MAX_BUTTONS_PER_ROW),
        });
      }
      return actionRows;
    },
  );
  return leaderboard;
}

/**
 * Test-only helper. Do not import from production code.
 *
 * Encapsulates the database-timeout fallback assertion shared across the
 * `/insights` toplist fact resolvers: install fake timers, invoke the resolver
 * with a service whose query never resolves, advance past the 2000ms timeout,
 * and assert the resolver falls back to `expectedMessage`.
 * Real timers are always restored.
 *
 * @param invoke  calls the resolver under test with the supplied fake service
 * @param makeNeverResolvingService  builds a service whose relevant query
 *   returns `new Promise(() => {})` (never settles)
 * @param expectedMessage  the expected fallback message
 */
export async function expectTimeoutFallback<S>(
  invoke: (service: S) => Promise<unknown>,
  makeNeverResolvingService: () => S,
  expectedMessage: string,
): Promise<void> {
  vi.useFakeTimers();
  try {
    const promise = invoke(makeNeverResolvingService());
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toBe(expectedMessage);
  } finally {
    vi.useRealTimers();
  }
}
