import type { FactScope } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { LeaderboardService } from '../leaderboard.service';
import type {
  CountedRow,
  MakeToplistResolversOptions,
  ToplistResolver,
} from './toplist-factory';
import { makeToplistResolvers } from './toplist-factory';

export type {
  CountedRow,
  ScopedCountMethods,
  ToplistResolver,
} from './toplist-factory';

/** Options for {@link ToplistFactoryService.makeResolvers}. */
export type MakeResolversOptions<
  TMethod extends string,
  TRow extends CountedRow,
> = Omit<MakeToplistResolversOptions<TMethod, TRow>, 'leaderboard'>;

/**
 * Builds the thin `/insights` toplist resolvers from a table of
 * method-name -> embed title. Each resolver is the same three lines — run the
 * named count under the shared timeout/no-data handling and title the embed —
 * so the table is the only part worth reading.
 */
@Injectable()
export class ToplistFactoryService {
  constructor(private readonly leaderboard: LeaderboardService) {}

  makeResolvers<
    TMethod extends string,
    TService extends Record<
      TMethod,
      (scope: FactScope, limit: number) => Promise<TRow[]>
    >,
    TRow extends CountedRow = CountedRow,
  >(
    options: MakeResolversOptions<TMethod, TRow>,
  ): Record<TMethod, ToplistResolver<TService>> {
    return makeToplistResolvers<TMethod, TService, TRow>({
      ...options,
      leaderboard: this.leaderboard,
    });
  }
}
