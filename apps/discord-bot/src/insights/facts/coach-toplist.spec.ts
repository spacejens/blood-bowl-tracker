import type { CoachesService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveCoachMatchesPlayedToplist,
  resolveCoachTeamsToplist,
} from './coach-toplist';

describe('resolveCoachMatchesPlayedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const coaches = {
      countMatchesPlayedByCoach: vi.fn().mockResolvedValue([
        { coachId: 1, name: 'Roze Madder', count: 9 },
        { coachId: 2, name: 'Grashnak', count: 9 },
        { coachId: 3, name: 'Skabsquik', count: 4 },
      ]),
    } as unknown as CoachesService;
    const result = await resolveCoachMatchesPlayedToplist(coaches);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches played',
          description: '1. Roze Madder — 9\n1. Grashnak — 9\n2. Skabsquik — 4',
        },
      ],
    });
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const coaches = {
        countMatchesPlayedByCoach: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as CoachesService;
      const promise = resolveCoachMatchesPlayedToplist(coaches);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveCoachTeamsToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const coaches = {
      countTeamsByCoach: vi
        .fn()
        .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 3 }]),
    } as unknown as CoachesService;
    const result = await resolveCoachTeamsToplist(coaches);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by teams coached',
          description: '1. Roze Madder — 3',
        },
      ],
    });
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const coaches = {
        countTeamsByCoach: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as CoachesService;
      const promise = resolveCoachTeamsToplist(coaches);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});
