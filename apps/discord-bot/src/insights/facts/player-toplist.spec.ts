import type { PlayersService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { resolvePlayerMvpsToplist } from './player-toplist';

describe('resolvePlayerMvpsToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const players = {
      countMvpAwardsByPlayer: vi.fn().mockResolvedValue([
        { playerId: 1, name: 'Griff Oberwald', count: 7 },
        { playerId: 2, name: 'Morg n Thorg', count: 7 },
        { playerId: 3, name: 'Zug', count: 3 },
      ]),
    } as unknown as PlayersService;
    const result = await resolvePlayerMvpsToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by MVP awards',
          description: '1. Griff Oberwald — 7\n1. Morg n Thorg — 7\n2. Zug — 3',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countMvpAwardsByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 3 }]);
    const players = {
      countMvpAwardsByPlayer,
    } as unknown as PlayersService;
    await resolvePlayerMvpsToplist(players, 20);
    expect(countMvpAwardsByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countMvpAwardsByPlayer: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerMvpsToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});
