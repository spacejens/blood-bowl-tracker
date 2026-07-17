import { describe, expect, it, vi } from 'vitest';

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
    eraId?: number,
    competitionId?: number,
  ) => Promise<{ name: string; count: number }[]>;
  beta: (
    eraId?: number,
    competitionId?: number,
  ) => Promise<{ name: string; count: number }[]>;
}

describe('makeToplistResolvers', () => {
  it('builds one resolver per entry, keyed by the entry name', () => {
    const resolvers = makeToplistResolvers<StubService, 'alpha' | 'beta'>(
      { alpha: 'A title', beta: 'B title' },
      'timed out',
      'no data',
    );
    expect(Object.keys(resolvers).sort()).toEqual(['alpha', 'beta']);
  });

  it('calls the named method with the era and competition and titles the embed', async () => {
    const resolvers = makeToplistResolvers<StubService, 'alpha'>(
      { alpha: 'A title' },
      'timed out',
      'no data',
    );
    const alpha = vi.fn().mockResolvedValue([{ name: 'Griff', count: 3 }]);
    const reply = await resolvers.alpha({ alpha } as never, 7, 9);
    expect(alpha).toHaveBeenCalledWith(7, 9);
    expect(reply).toEqual({
      embeds: [{ title: 'A title', description: '1. Griff — 3' }],
    });
  });

  it('falls back to the no-data message for an empty result', async () => {
    const resolvers = makeToplistResolvers<StubService, 'alpha'>(
      { alpha: 'A title' },
      'timed out',
      'no data',
    );
    const alpha = vi.fn().mockResolvedValue([]);
    const reply = await resolvers.alpha({ alpha } as never);
    expect(reply).toEqual({
      embeds: [{ title: 'A title', description: 'no data' }],
    });
  });
});
