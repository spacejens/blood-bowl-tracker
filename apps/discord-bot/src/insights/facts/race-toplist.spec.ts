import type { RacesService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveRaceMatchesPlayedToplist,
  resolveRaceTeamsToplist,
} from './race-toplist';

describe('resolveRaceTeamsToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const races = {
      countTeamsByRace: vi.fn().mockResolvedValue([
        { raceId: 1, name: 'Orc', count: 12 },
        { raceId: 2, name: 'Skaven', count: 12 },
        { raceId: 3, name: 'Elf', count: 4 },
      ]),
    } as unknown as RacesService;
    const result = await resolveRaceTeamsToplist(races);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by race',
          description: '1. Orc — 12\n1. Skaven — 12\n2. Elf — 4',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countTeamsByRace = vi
      .fn()
      .mockResolvedValue([{ raceId: 1, name: 'Orc', count: 3 }]);
    const races = { countTeamsByRace } as unknown as RacesService;
    await resolveRaceTeamsToplist(races, 20);
    expect(countTeamsByRace).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const races = {
        countTeamsByRace: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as RacesService;
      const promise = resolveRaceTeamsToplist(races);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveRaceMatchesPlayedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const races = {
      countMatchesPlayedByRace: vi.fn().mockResolvedValue([
        { raceId: 1, name: 'Orc', count: 40 },
        { raceId: 2, name: 'Skaven', count: 18 },
      ]),
    } as unknown as RacesService;
    const result = await resolveRaceMatchesPlayedToplist(races);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Matches played by race',
          description: '1. Orc — 40\n2. Skaven — 18',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countMatchesPlayedByRace = vi
      .fn()
      .mockResolvedValue([{ raceId: 1, name: 'Orc', count: 6 }]);
    const races = { countMatchesPlayedByRace } as unknown as RacesService;
    await resolveRaceMatchesPlayedToplist(races, 20);
    expect(countMatchesPlayedByRace).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const races = {
        countMatchesPlayedByRace: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as RacesService;
      const promise = resolveRaceMatchesPlayedToplist(races);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});
