import type { CoachesService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveCoachCompetitionsPlayedToplist,
  resolveCoachErasActiveToplist,
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

describe('resolveCoachCompetitionsPlayedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const coaches = {
      countCompetitionsByCoach: vi.fn().mockResolvedValue([
        { coachId: 1, name: 'Roze Madder', count: 5 },
        { coachId: 2, name: 'Grashnak', count: 2 },
      ]),
    } as unknown as CoachesService;
    const result = await resolveCoachCompetitionsPlayedToplist(coaches);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by competitions played',
          description: '1. Roze Madder — 5\n2. Grashnak — 2',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countCompetitionsByCoach = vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 3 }]);
    const coaches = {
      countCompetitionsByCoach,
    } as unknown as CoachesService;
    await resolveCoachCompetitionsPlayedToplist(coaches, 20);
    expect(countCompetitionsByCoach).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const coaches = {
        countCompetitionsByCoach: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as CoachesService;
      const promise = resolveCoachCompetitionsPlayedToplist(coaches);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveCoachErasActiveToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const coaches = {
      countErasByCoach: vi
        .fn()
        .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 3 }]),
    } as unknown as CoachesService;
    const result = await resolveCoachErasActiveToplist(coaches);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by eras active',
          description: '1. Roze Madder — 3',
        },
      ],
    });
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const coaches = {
        countErasByCoach: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as CoachesService;
      const promise = resolveCoachErasActiveToplist(coaches);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});
