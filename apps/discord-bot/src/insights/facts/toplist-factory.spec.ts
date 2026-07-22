import type { FactScope } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { TOPLIST_FETCH_LIMIT } from '../leaderboard';
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
    });
    expect(Object.keys(resolvers).sort()).toEqual(['alpha', 'beta']);
  });

  it('calls the named method with the era and competition and titles the embed', async () => {
    const resolvers = makeToplistResolvers<'alpha', StubService>({
      titles: { alpha: 'A title' },
      timeoutMessage: 'timed out',
      noDataMessage: 'no data',
    });
    const alpha = vi.fn().mockResolvedValue([{ name: 'Griff', count: 3 }]);
    const reply = await resolvers.alpha({ alpha } as never, {
      eraId: 7,
      competitionId: 9,
    });
    expect(alpha).toHaveBeenCalledWith(
      { eraId: 7, competitionId: 9 },
      TOPLIST_FETCH_LIMIT,
    );
    expect(reply).toEqual({
      embeds: [{ title: 'A title', description: '1. Griff — 3' }],
    });
  });

  it('falls back to the no-data message for an empty result', async () => {
    const resolvers = makeToplistResolvers<'alpha', StubService>({
      titles: { alpha: 'A title' },
      timeoutMessage: 'timed out',
      noDataMessage: 'no data',
    });
    const alpha = vi.fn().mockResolvedValue([]);
    const reply = await resolvers.alpha({ alpha } as never, {});
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
    });
    const gamma = vi.fn().mockResolvedValue([
      { teamId: 4, name: 'Griff', count: 3 },
      { teamId: 9, name: 'Morg', count: 1 },
    ]);
    const reply = (await resolvers.gamma({ gamma }, {})) as unknown as {
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
