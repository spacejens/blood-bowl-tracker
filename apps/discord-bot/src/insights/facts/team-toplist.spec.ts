import type { TeamsService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveTeamCasualtiesCausedToplist,
  resolveTeamCasualtiesSufferedToplist,
  resolveTeamCompetitionsPlayedToplist,
  resolveTeamCompletionsToplist,
  resolveTeamDeathsCausedToplist,
  resolveTeamDeathsSufferedToplist,
  resolveTeamDeflectionsToplist,
  resolveTeamErasActiveToplist,
  resolveTeamFoulsCommittedToplist,
  resolveTeamInterceptionsToplist,
  resolveTeamLastingInjuriesSufferedToplist,
  resolveTeamMatchesPlayedToplist,
  resolveTeamSeriousInjuriesCausedToplist,
  resolveTeamSeriousInjuriesSufferedToplist,
  resolveTeamTimesSentOffToplist,
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

describe('resolveTeamCasualtiesCausedToplist', () => {
  it('returns a leaderboard embed built from the query rows including a tie', async () => {
    const teams = {
      countCasualtiesCausedByTeam: vi.fn().mockResolvedValue([
        { teamId: 1, name: '40 grinders', count: 22 },
        { teamId: 2, name: 'Gouged Eye', count: 22 },
        { teamId: 3, name: 'Reikland Reavers', count: 9 },
      ]),
    } as unknown as TeamsService;
    const result = await resolveTeamCasualtiesCausedToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by casualties inflicted',
          description:
            '1. 40 grinders — 22\n1. Gouged Eye — 22\n2. Reikland Reavers — 9',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countCasualtiesCausedByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 3 }]);
    const teams = { countCasualtiesCausedByTeam } as unknown as TeamsService;
    await resolveTeamCasualtiesCausedToplist(teams, 20);
    expect(countCasualtiesCausedByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countCasualtiesCausedByTeam: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamCasualtiesCausedToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamSeriousInjuriesCausedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countSeriousInjuriesCausedByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 7 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamSeriousInjuriesCausedToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by serious injuries inflicted',
          description: '1. 40 grinders — 7',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countSeriousInjuriesCausedByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]);
    const teams = {
      countSeriousInjuriesCausedByTeam,
    } as unknown as TeamsService;
    await resolveTeamSeriousInjuriesCausedToplist(teams, 20);
    expect(countSeriousInjuriesCausedByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countSeriousInjuriesCausedByTeam: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamSeriousInjuriesCausedToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamDeathsCausedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countDeathsCausedByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamDeathsCausedToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by opponents killed',
          description: '1. 40 grinders — 4',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countDeathsCausedByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 1 }]);
    const teams = { countDeathsCausedByTeam } as unknown as TeamsService;
    await resolveTeamDeathsCausedToplist(teams, 20);
    expect(countDeathsCausedByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countDeathsCausedByTeam: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamDeathsCausedToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamFoulsCommittedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countFoulsCommittedByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 13 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamFoulsCommittedToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by fouls committed',
          description: '1. 40 grinders — 13',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countFoulsCommittedByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]);
    const teams = { countFoulsCommittedByTeam } as unknown as TeamsService;
    await resolveTeamFoulsCommittedToplist(teams, 20);
    expect(countFoulsCommittedByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countFoulsCommittedByTeam: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamFoulsCommittedToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamTimesSentOffToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countTimesSentOffByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 8 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamTimesSentOffToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by times sent off',
          description: '1. 40 grinders — 8',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countTimesSentOffByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]);
    const teams = { countTimesSentOffByTeam } as unknown as TeamsService;
    await resolveTeamTimesSentOffToplist(teams, 20);
    expect(countTimesSentOffByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countTimesSentOffByTeam: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamTimesSentOffToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamCasualtiesSufferedToplist', () => {
  it('returns a leaderboard embed built from the query rows including a tie', async () => {
    const teams = {
      countCasualtiesSufferedByTeam: vi.fn().mockResolvedValue([
        { teamId: 1, name: '40 grinders', count: 18 },
        { teamId: 2, name: 'Gouged Eye', count: 18 },
        { teamId: 3, name: 'Chaos All-Stars', count: 5 },
      ]),
    } as unknown as TeamsService;
    const result = await resolveTeamCasualtiesSufferedToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by casualties suffered',
          description:
            '1. 40 grinders — 18\n1. Gouged Eye — 18\n2. Chaos All-Stars — 5',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countCasualtiesSufferedByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 3 }]);
    const teams = { countCasualtiesSufferedByTeam } as unknown as TeamsService;
    await resolveTeamCasualtiesSufferedToplist(teams, 20);
    expect(countCasualtiesSufferedByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countCasualtiesSufferedByTeam: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamCasualtiesSufferedToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamSeriousInjuriesSufferedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countSeriousInjuriesSufferedByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 6 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamSeriousInjuriesSufferedToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by serious injuries suffered',
          description: '1. 40 grinders — 6',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countSeriousInjuriesSufferedByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]);
    const teams = {
      countSeriousInjuriesSufferedByTeam,
    } as unknown as TeamsService;
    await resolveTeamSeriousInjuriesSufferedToplist(teams, 20);
    expect(countSeriousInjuriesSufferedByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countSeriousInjuriesSufferedByTeam: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamSeriousInjuriesSufferedToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamLastingInjuriesSufferedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countLastingInjuriesSufferedByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamLastingInjuriesSufferedToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by lasting injuries suffered',
          description: '1. 40 grinders — 4',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countLastingInjuriesSufferedByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]);
    const teams = {
      countLastingInjuriesSufferedByTeam,
    } as unknown as TeamsService;
    await resolveTeamLastingInjuriesSufferedToplist(teams, 20);
    expect(countLastingInjuriesSufferedByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countLastingInjuriesSufferedByTeam: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamLastingInjuriesSufferedToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveTeamDeathsSufferedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const teams = {
      countDeathsSufferedByTeam: vi
        .fn()
        .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]),
    } as unknown as TeamsService;
    const result = await resolveTeamDeathsSufferedToplist(teams);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by deaths suffered',
          description: '1. 40 grinders — 2',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countDeathsSufferedByTeam = vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 1 }]);
    const teams = { countDeathsSufferedByTeam } as unknown as TeamsService;
    await resolveTeamDeathsSufferedToplist(teams, 20);
    expect(countDeathsSufferedByTeam).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const teams = {
        countDeathsSufferedByTeam: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as TeamsService;
      const promise = resolveTeamDeathsSufferedToplist(teams);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});
