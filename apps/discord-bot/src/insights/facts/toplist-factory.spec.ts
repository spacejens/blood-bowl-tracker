import type { FactScope } from '@blood-bowl-tracker/game-data';
import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { makeToplistResolvers } from './toplist-factory';

/**
 * A stand-in service shape for exercising the factory in isolation. The
 * factory's `TService` type parameter has nothing to infer it from when the
 * titles table is the only argument, so tests pin it explicitly rather than
 * relying on inference (the production call sites in player-toplist.ts and
 * team-toplist.ts do the same).
 */
interface StubService {
  alpha: (
    scope: FactScope,
    limit: number,
  ) => Promise<{ name: string; count: number }[]>;
  beta: (
    scope: FactScope,
    limit: number,
  ) => Promise<{ name: string; count: number }[]>;
}

describe('makeToplistResolvers', () => {
  it('builds one resolver per entry, keyed by the entry name', () => {
    const resolvers = makeToplistResolvers<'alpha' | 'beta', StubService>({
      titles: { alpha: 'A title', beta: 'B title' },
      timeoutMessage: 'timed out',
      noDataMessage: 'no data',
      leaderboard: mock<LeaderboardService>(),
    });
    expect(Object.keys(resolvers).sort()).toEqual(['alpha', 'beta']);
  });

  describe('a resolver built from an entry', () => {
    it('calls leaderboard.resolveToplist with the entry title and messages', async () => {
      const leaderboard = mock<LeaderboardService>();
      leaderboard.resolveToplist.mockResolvedValue('placeholder reply');
      const resolvers = makeToplistResolvers<'alpha', StubService>({
        titles: { alpha: 'A title' },
        timeoutMessage: 'timed out',
        noDataMessage: 'no data',
        leaderboard,
      });
      const alpha = vi.fn().mockResolvedValue([{ name: 'Griff', count: 3 }]);
      await resolvers.alpha({ alpha } as never, {
        eraId: 7,
        competitionId: 9,
      });
      expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'A title',
          timeoutMessage: 'timed out',
          noDataMessage: 'no data',
        }),
      );
    });

    it('binds fetchRows to call the named method with the scope and TOPLIST_FETCH_LIMIT', async () => {
      const leaderboard = mock<LeaderboardService>();
      leaderboard.resolveToplist.mockImplementation(async (options) => {
        await options.fetchRows(TOPLIST_FETCH_LIMIT);
        return 'placeholder reply';
      });
      const resolvers = makeToplistResolvers<'alpha', StubService>({
        titles: { alpha: 'A title' },
        timeoutMessage: 'timed out',
        noDataMessage: 'no data',
        leaderboard,
      });
      const alpha = vi.fn().mockResolvedValue([{ name: 'Griff', count: 3 }]);
      await resolvers.alpha({ alpha } as never, {
        eraId: 7,
        competitionId: 9,
      });
      expect(alpha).toHaveBeenCalledWith(
        { eraId: 7, competitionId: 9 },
        TOPLIST_FETCH_LIMIT,
      );
    });

    it('returns whatever leaderboard.resolveToplist resolves to, verbatim', async () => {
      const leaderboard = mock<LeaderboardService>();
      leaderboard.resolveToplist.mockResolvedValue('no data');
      const resolvers = makeToplistResolvers<'alpha', StubService>({
        titles: { alpha: 'A title' },
        timeoutMessage: 'timed out',
        noDataMessage: 'no data',
        leaderboard,
      });
      const alpha = vi.fn().mockResolvedValue([]);
      const reply = await resolvers.alpha(
        { alpha } as never,
        FACT_SCOPE_ALL_TIME,
      );
      expect(reply).toBe('no data');
    });

    it('threads entityLink through to leaderboard.resolveToplist', async () => {
      const leaderboard = mock<LeaderboardService>();
      leaderboard.resolveToplist.mockResolvedValue('placeholder reply');
      interface TeamStub {
        gamma: (
          scope: FactScope,
          limit: number,
        ) => Promise<{ teamId: number; name: string; count: number }[]>;
      }
      const entityLink = {
        customIdPrefix: 'deepdive:team:',
        entityId: (row: { teamId: number; name: string; count: number }) =>
          row.teamId,
      };
      const resolvers = makeToplistResolvers<
        'gamma',
        TeamStub,
        { teamId: number; name: string; count: number }
      >({
        titles: { gamma: 'G title' },
        timeoutMessage: 'timed out',
        noDataMessage: 'no data',
        entityLink,
        leaderboard,
      });
      const gamma = vi.fn().mockResolvedValue([]);
      await resolvers.gamma({ gamma }, FACT_SCOPE_ALL_TIME);
      expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
        expect.objectContaining({ entityLink }),
      );
    });

    it('runs decorateRows over the fetched rows when the hook is supplied', async () => {
      const leaderboard = mock<LeaderboardService>();
      let fetched: { name: string; count: number }[] = [];
      leaderboard.resolveToplist.mockImplementation(async (options) => {
        fetched = await options.fetchRows(TOPLIST_FETCH_LIMIT);
        return 'placeholder reply';
      });
      const decorateRows = vi
        .fn()
        .mockResolvedValue([{ name: 'Griff (decorated)', count: 3 }]);
      const resolvers = makeToplistResolvers<'alpha', StubService>({
        titles: { alpha: 'A title' },
        timeoutMessage: 'timed out',
        noDataMessage: 'no data',
        decorateRows,
        leaderboard,
      });
      const alpha = vi.fn().mockResolvedValue([{ name: 'Griff', count: 3 }]);
      await resolvers.alpha({ alpha } as never, FACT_SCOPE_ALL_TIME);
      expect(decorateRows).toHaveBeenCalledWith([{ name: 'Griff', count: 3 }]);
      expect(fetched).toEqual([{ name: 'Griff (decorated)', count: 3 }]);
    });

    it('returns the fetched rows unchanged when no decorateRows hook is supplied', async () => {
      const leaderboard = mock<LeaderboardService>();
      let fetched: { name: string; count: number }[] = [];
      leaderboard.resolveToplist.mockImplementation(async (options) => {
        fetched = await options.fetchRows(TOPLIST_FETCH_LIMIT);
        return 'placeholder reply';
      });
      const resolvers = makeToplistResolvers<'alpha', StubService>({
        titles: { alpha: 'A title' },
        timeoutMessage: 'timed out',
        noDataMessage: 'no data',
        leaderboard,
      });
      const alpha = vi.fn().mockResolvedValue([{ name: 'Griff', count: 3 }]);
      await resolvers.alpha({ alpha } as never, FACT_SCOPE_ALL_TIME);
      expect(fetched).toEqual([{ name: 'Griff', count: 3 }]);
    });

    it('threads formatRow through to leaderboard.resolveToplist', async () => {
      const leaderboard = mock<LeaderboardService>();
      leaderboard.resolveToplist.mockResolvedValue('placeholder reply');
      const formatRow = (row: {
        name: string;
        count: number;
        rank: number;
      }): string => `${row.rank}! ${row.name}`;
      const resolvers = makeToplistResolvers<'alpha', StubService>({
        titles: { alpha: 'A title' },
        timeoutMessage: 'timed out',
        noDataMessage: 'no data',
        formatRow,
        leaderboard,
      });
      const alpha = vi.fn().mockResolvedValue([]);
      await resolvers.alpha({ alpha } as never, FACT_SCOPE_ALL_TIME);
      expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
        expect.objectContaining({ formatRow }),
      );
    });
  });
});
