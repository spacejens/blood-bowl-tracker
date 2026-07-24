import type { FactScope } from '@blood-bowl-tracker/game-data';
import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { makeLeaderboardMock } from './toplist.test-helpers';
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
      leaderboard: makeLeaderboardMock(),
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

    it('threads buildCustomId through to leaderboard.resolveToplist', async () => {
      const leaderboard = mock<LeaderboardService>();
      leaderboard.resolveToplist.mockResolvedValue('placeholder reply');
      interface TeamStub {
        gamma: (
          scope: FactScope,
          limit: number,
        ) => Promise<{ teamId: number; name: string; count: number }[]>;
      }
      const buildCustomId = (row: {
        teamId: number;
        name: string;
        count: number;
      }) => `deepdive:team:${row.teamId}`;
      const resolvers = makeToplistResolvers<
        'gamma',
        TeamStub,
        { teamId: number; name: string; count: number }
      >({
        titles: { gamma: 'G title' },
        timeoutMessage: 'timed out',
        noDataMessage: 'no data',
        buildCustomId,
        leaderboard,
      });
      const gamma = vi.fn().mockResolvedValue([]);
      await resolvers.gamma({ gamma }, FACT_SCOPE_ALL_TIME);
      expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
        expect.objectContaining({ buildCustomId }),
      );
    });
  });

  describe('against a real (mock-backed) leaderboard.resolveToplist', () => {
    let leaderboard: ReturnType<typeof makeLeaderboardMock>;

    beforeEach(() => {
      leaderboard = makeLeaderboardMock();
    });

    it('titles the embed and renders one line per row', async () => {
      const resolvers = makeToplistResolvers<'alpha', StubService>({
        titles: { alpha: 'A title' },
        timeoutMessage: 'timed out',
        noDataMessage: 'no data',
        leaderboard,
      });
      const alpha = vi.fn().mockResolvedValue([{ name: 'Griff', count: 3 }]);
      const reply = await resolvers.alpha({ alpha } as never, {
        eraId: 7,
        competitionId: 9,
      });
      expect(reply).toEqual({
        embeds: [{ title: 'A title', description: '1. Griff — 3' }],
      });
    });

    it('falls back to the no-data message for an empty result', async () => {
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
      expect(reply).toEqual({
        embeds: [{ title: 'A title', description: 'no data' }],
      });
    });

    it('threads buildCustomId through to one button per row', async () => {
      interface TeamStub {
        gamma: (
          scope: FactScope,
          limit: number,
        ) => Promise<{ teamId: number; name: string; count: number }[]>;
      }
      const resolvers = makeToplistResolvers<
        'gamma',
        TeamStub,
        { teamId: number; name: string; count: number }
      >({
        titles: { gamma: 'G title' },
        timeoutMessage: 'timed out',
        noDataMessage: 'no data',
        buildCustomId: (row) => `deepdive:team:${row.teamId}`,
        leaderboard,
      });
      const gamma = vi.fn().mockResolvedValue([
        { teamId: 4, name: 'Griff', count: 3 },
        { teamId: 9, name: 'Morg', count: 1 },
      ]);
      const reply = (await resolvers.gamma(
        { gamma },
        FACT_SCOPE_ALL_TIME,
      )) as unknown as {
        components: { components: { label: string; custom_id: string }[] }[];
      };
      const buttons = reply.components.flatMap((row) => row.components);
      expect(buttons.map((b) => b.custom_id)).toEqual([
        'deepdive:team:4',
        'deepdive:team:9',
      ]);
      expect(buttons.map((b) => b.label)).toEqual(['Griff', 'Morg']);
    });
  });
});
