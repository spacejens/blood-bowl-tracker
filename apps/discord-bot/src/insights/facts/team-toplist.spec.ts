import type { TeamsService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { resolveTeamMatchesPlayedToplist } from './team-toplist';

describe('resolveTeamMatchesPlayedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countMatchesPlayedByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 12 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamMatchesPlayedToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by matches played',
          description: '1. 40 grinders — 12',
        },
      ],
    });
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countMatchesPlayedByTeam: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamMatchesPlayedToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});
