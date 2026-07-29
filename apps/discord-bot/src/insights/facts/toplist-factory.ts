import type { FactScope } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import type { EntityLink } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';

/** A row shape every scoped toplist count returns. */
interface CountedRow {
  name: string;
  count: number;
}

/**
 * The service methods a toplist factory can bind to: those taking an optional
 * era and competition and resolving to named counts. The three team toplists
 * with narrower signatures (matches played, competitions played, eras active)
 * do not fit and stay hand-written.
 */
export type ScopedCountMethods<TService> = {
  [K in keyof TService]: TService[K] extends (
    scope: FactScope,
    limit: number,
  ) => Promise<CountedRow[]>
    ? K
    : never;
}[keyof TService];

export type ToplistResolver<TService> = (
  service: TService,
  scope: FactScope,
) => Promise<string | InteractionReplyOptions>;

/** Options for {@link makeToplistResolvers}. */
export interface MakeToplistResolversOptions<
  TMethod extends string,
  TRow extends CountedRow,
> {
  titles: Record<TMethod, string>;
  timeoutMessage: string;
  noDataMessage: string;
  entityLink?: EntityLink<TRow>;
  /**
   * Enriches every fetched row before ranking — e.g. attaching each team's
   * race/coach context. Runs inside `fetchRows`, so it is covered by the
   * toplist's database timeout, and it sees the full fetch window rather than
   * only the rows that survive tie truncation.
   */
  decorateRows?: (rows: TRow[]) => Promise<TRow[]>;
  /** Overrides the default `"<rank>. <name> — <count>"` line rendering. */
  formatRow?: (row: TRow & { rank: number }) => string;
  leaderboard: LeaderboardService;
}

/**
 * Builds the thin `/insights` toplist resolvers from a table of
 * method-name -> embed title. Each resolver is the same three lines — run the
 * named count under the shared timeout/no-data handling and title the embed —
 * so the table is the only part worth reading.
 */
export function makeToplistResolvers<
  TMethod extends string,
  TService extends Record<
    TMethod,
    (scope: FactScope, limit: number) => Promise<TRow[]>
  >,
  TRow extends CountedRow = CountedRow,
>(
  options: MakeToplistResolversOptions<TMethod, TRow>,
): Record<TMethod, ToplistResolver<TService>> {
  const {
    titles,
    timeoutMessage,
    noDataMessage,
    entityLink,
    decorateRows,
    formatRow,
    leaderboard,
  } = options;
  const resolvers = {} as Record<TMethod, ToplistResolver<TService>>;
  for (const method of Object.keys(titles) as TMethod[]) {
    resolvers[method] = (service, scope) => {
      return leaderboard.resolveToplist({
        title: titles[method],
        fetchRows: async (limit) => {
          const rows = await service[method](scope, limit);
          return decorateRows === undefined ? rows : decorateRows(rows);
        },
        timeoutMessage,
        noDataMessage,
        entityLink,
        formatRow,
      });
    };
  }
  return resolvers;
}
