import type { TeamsService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveTeamCompetitionsPlayedToplist,
  resolveTeamErasActiveToplist,
  resolveTeamMatchesPlayedToplist,
} from './team-toplist';

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

describe('resolveTeamCompetitionsPlayedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countCompetitionsByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamCompetitionsPlayedToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by competitions played',
          description: '1. 40 grinders — 4',
        },
      ],
    });
  });

  it('passes the eraId through to the query', async () => {
    const countCompetitionsByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]);
    const teams = { countCompetitionsByTeam } as unknown as TeamsService;
    await resolveTeamCompetitionsPlayedToplist(teams, 20);
    expect(countCompetitionsByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countCompetitionsByTeam: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamCompetitionsPlayedToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamErasActiveToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countErasByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 3 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamErasActiveToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by eras active',
          description: '1. 40 grinders — 3',
        },
      ],
    });
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countErasByTeam: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamErasActiveToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});
