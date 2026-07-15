import type { TeamsService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveTeamCompetitionsPlayedToplist,
  resolveTeamCompletionsToplist,
  resolveTeamDeflectionsToplist,
  resolveTeamErasActiveToplist,
  resolveTeamInterceptionsToplist,
  resolveTeamMatchesPlayedToplist,
  resolveTeamTouchdownsScoredToplist,
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

describe('resolveTeamTouchdownsScoredToplist', () => {
  it('returns a leaderboard embed built from the query rows including a tie', async () => {
    const teams = {
      countTouchdownsScoredByTeam: vi.fn().mockResolvedValue([
        { teamId: 1, name: '40 grinders', count: 15 },
        { teamId: 2, name: 'Gouged Eye', count: 15 },
        { teamId: 3, name: 'Reikland Reavers', count: 6 },
      ]),
    } as unknown as TeamsService;
    const result = await resolveTeamTouchdownsScoredToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by touchdowns scored',
          description:
            '1. 40 grinders — 15\n1. Gouged Eye — 15\n2. Reikland Reavers — 6',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countTouchdownsScoredByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 3 }]);
    const teams = { countTouchdownsScoredByTeam } as unknown as TeamsService;
    await resolveTeamTouchdownsScoredToplist(teams, 20);
    expect(countTouchdownsScoredByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countTouchdownsScoredByTeam: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamTouchdownsScoredToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamCompletionsToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countCompletionsByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 8 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamCompletionsToplist(teams);
    expect(result).toEqual({
      embeds: [
        { title: 'Teams by completions', description: '1. 40 grinders — 8' },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countCompletionsByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]);
    const teams = { countCompletionsByTeam } as unknown as TeamsService;
    await resolveTeamCompletionsToplist(teams, 20);
    expect(countCompletionsByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countCompletionsByTeam: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamCompletionsToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamInterceptionsToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countInterceptionsByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 5 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamInterceptionsToplist(teams);
    expect(result).toEqual({
      embeds: [
        { title: 'Teams by interceptions', description: '1. 40 grinders — 5' },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countInterceptionsByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]);
    const teams = { countInterceptionsByTeam } as unknown as TeamsService;
    await resolveTeamInterceptionsToplist(teams, 20);
    expect(countInterceptionsByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countInterceptionsByTeam: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamInterceptionsToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamDeflectionsToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countDeflectionsByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamDeflectionsToplist(teams);
    expect(result).toEqual({
      embeds: [
        { title: 'Teams by deflections', description: '1. 40 grinders — 4' },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countDeflectionsByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]);
    const teams = { countDeflectionsByTeam } as unknown as TeamsService;
    await resolveTeamDeflectionsToplist(teams, 20);
    expect(countDeflectionsByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countDeflectionsByTeam: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamDeflectionsToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});
