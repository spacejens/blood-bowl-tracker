import type { PlayersService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  resolvePlayerCasualtiesCausedToplist,
  resolvePlayerCasualtiesSufferedToplist,
  resolvePlayerCompletionsToplist,
  resolvePlayerDeathsCausedToplist,
  resolvePlayerDeflectionsToplist,
  resolvePlayerFoulsCommittedToplist,
  resolvePlayerInterceptionsToplist,
  resolvePlayerLastingInjuriesSufferedToplist,
  resolvePlayerMvpsToplist,
  resolvePlayerSeriousInjuriesCausedToplist,
  resolvePlayerSeriousInjuriesSufferedToplist,
  resolvePlayerTimesSentOffToplist,
  resolvePlayerTouchdownsScoredToplist,
} from './player-toplist';

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

describe('resolvePlayerTouchdownsScoredToplist', () => {
  it('returns a leaderboard embed built from the query rows including a tie', async () => {
    const players = {
      countTouchdownsScoredByPlayer: vi.fn().mockResolvedValue([
        { playerId: 1, name: 'Griff Oberwald', count: 9 },
        { playerId: 2, name: 'Zug', count: 9 },
        { playerId: 3, name: 'Morg n Thorg', count: 4 },
      ]),
    } as unknown as PlayersService;
    const result = await resolvePlayerTouchdownsScoredToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by touchdowns scored',
          description: '1. Griff Oberwald — 9\n1. Zug — 9\n2. Morg n Thorg — 4',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countTouchdownsScoredByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 3 }]);
    const players = {
      countTouchdownsScoredByPlayer,
    } as unknown as PlayersService;
    await resolvePlayerTouchdownsScoredToplist(players, 20);
    expect(countTouchdownsScoredByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countTouchdownsScoredByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerTouchdownsScoredToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolvePlayerCompletionsToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const players = {
      countCompletionsByPlayer: vi
        .fn()
        .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 6 }]),
    } as unknown as PlayersService;
    const result = await resolvePlayerCompletionsToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by completions',
          description: '1. Griff Oberwald — 6',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countCompletionsByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 2 }]);
    const players = { countCompletionsByPlayer } as unknown as PlayersService;
    await resolvePlayerCompletionsToplist(players, 20);
    expect(countCompletionsByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countCompletionsByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerCompletionsToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolvePlayerInterceptionsToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const players = {
      countInterceptionsByPlayer: vi
        .fn()
        .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 5 }]),
    } as unknown as PlayersService;
    const result = await resolvePlayerInterceptionsToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by interceptions',
          description: '1. Griff Oberwald — 5',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countInterceptionsByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 2 }]);
    const players = { countInterceptionsByPlayer } as unknown as PlayersService;
    await resolvePlayerInterceptionsToplist(players, 20);
    expect(countInterceptionsByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countInterceptionsByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerInterceptionsToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolvePlayerDeflectionsToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const players = {
      countDeflectionsByPlayer: vi
        .fn()
        .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 4 }]),
    } as unknown as PlayersService;
    const result = await resolvePlayerDeflectionsToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by deflections',
          description: '1. Griff Oberwald — 4',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countDeflectionsByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 2 }]);
    const players = { countDeflectionsByPlayer } as unknown as PlayersService;
    await resolvePlayerDeflectionsToplist(players, 20);
    expect(countDeflectionsByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countDeflectionsByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerDeflectionsToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolvePlayerCasualtiesCausedToplist', () => {
  it('returns a leaderboard embed built from the query rows including a tie', async () => {
    const players = {
      countCasualtiesCausedByPlayer: vi.fn().mockResolvedValue([
        { playerId: 1, name: 'Morg n Thorg', count: 11 },
        { playerId: 2, name: 'Grashnak Blackhoof', count: 11 },
        { playerId: 3, name: 'Griff Oberwald', count: 4 },
      ]),
    } as unknown as PlayersService;
    const result = await resolvePlayerCasualtiesCausedToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by casualties inflicted',
          description:
            '1. Morg n Thorg — 11\n1. Grashnak Blackhoof — 11\n2. Griff Oberwald — 4',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countCasualtiesCausedByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 3 }]);
    const players = {
      countCasualtiesCausedByPlayer,
    } as unknown as PlayersService;
    await resolvePlayerCasualtiesCausedToplist(players, 20);
    expect(countCasualtiesCausedByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countCasualtiesCausedByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerCasualtiesCausedToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolvePlayerSeriousInjuriesCausedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const players = {
      countSeriousInjuriesCausedByPlayer: vi
        .fn()
        .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 3 }]),
    } as unknown as PlayersService;
    const result = await resolvePlayerSeriousInjuriesCausedToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by serious injuries inflicted',
          description: '1. Morg n Thorg — 3',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countSeriousInjuriesCausedByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 2 }]);
    const players = {
      countSeriousInjuriesCausedByPlayer,
    } as unknown as PlayersService;
    await resolvePlayerSeriousInjuriesCausedToplist(players, 20);
    expect(countSeriousInjuriesCausedByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countSeriousInjuriesCausedByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerSeriousInjuriesCausedToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolvePlayerDeathsCausedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const players = {
      countDeathsCausedByPlayer: vi
        .fn()
        .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 2 }]),
    } as unknown as PlayersService;
    const result = await resolvePlayerDeathsCausedToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by opponents killed',
          description: '1. Morg n Thorg — 2',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countDeathsCausedByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 1 }]);
    const players = { countDeathsCausedByPlayer } as unknown as PlayersService;
    await resolvePlayerDeathsCausedToplist(players, 20);
    expect(countDeathsCausedByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countDeathsCausedByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerDeathsCausedToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolvePlayerFoulsCommittedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const players = {
      countFoulsCommittedByPlayer: vi
        .fn()
        .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 6 }]),
    } as unknown as PlayersService;
    const result = await resolvePlayerFoulsCommittedToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by fouls committed',
          description: '1. Morg n Thorg — 6',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countFoulsCommittedByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 2 }]);
    const players = {
      countFoulsCommittedByPlayer,
    } as unknown as PlayersService;
    await resolvePlayerFoulsCommittedToplist(players, 20);
    expect(countFoulsCommittedByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countFoulsCommittedByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerFoulsCommittedToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolvePlayerTimesSentOffToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const players = {
      countTimesSentOffByPlayer: vi
        .fn()
        .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 5 }]),
    } as unknown as PlayersService;
    const result = await resolvePlayerTimesSentOffToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by times sent off',
          description: '1. Morg n Thorg — 5',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countTimesSentOffByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 2 }]);
    const players = { countTimesSentOffByPlayer } as unknown as PlayersService;
    await resolvePlayerTimesSentOffToplist(players, 20);
    expect(countTimesSentOffByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countTimesSentOffByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerTimesSentOffToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolvePlayerCasualtiesSufferedToplist', () => {
  it('returns a leaderboard embed built from the query rows including a tie', async () => {
    const players = {
      countCasualtiesSufferedByPlayer: vi.fn().mockResolvedValue([
        { playerId: 1, name: 'Griff Oberwald', count: 12 },
        { playerId: 2, name: 'Zug', count: 12 },
        { playerId: 3, name: 'Morg n Thorg', count: 3 },
      ]),
    } as unknown as PlayersService;
    const result = await resolvePlayerCasualtiesSufferedToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by casualties suffered',
          description: '1. Griff Oberwald — 12\n1. Zug — 12\n2. Morg n Thorg — 3',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countCasualtiesSufferedByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 3 }]);
    const players = {
      countCasualtiesSufferedByPlayer,
    } as unknown as PlayersService;
    await resolvePlayerCasualtiesSufferedToplist(players, 20);
    expect(countCasualtiesSufferedByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countCasualtiesSufferedByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerCasualtiesSufferedToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolvePlayerSeriousInjuriesSufferedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const players = {
      countSeriousInjuriesSufferedByPlayer: vi
        .fn()
        .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 5 }]),
    } as unknown as PlayersService;
    const result = await resolvePlayerSeriousInjuriesSufferedToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by serious injuries suffered',
          description: '1. Griff Oberwald — 5',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countSeriousInjuriesSufferedByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 2 }]);
    const players = {
      countSeriousInjuriesSufferedByPlayer,
    } as unknown as PlayersService;
    await resolvePlayerSeriousInjuriesSufferedToplist(players, 20);
    expect(countSeriousInjuriesSufferedByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countSeriousInjuriesSufferedByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerSeriousInjuriesSufferedToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolvePlayerLastingInjuriesSufferedToplist', () => {
  it('returns a leaderboard embed built from the query rows', async () => {
    const players = {
      countLastingInjuriesSufferedByPlayer: vi
        .fn()
        .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 4 }]),
    } as unknown as PlayersService;
    const result = await resolvePlayerLastingInjuriesSufferedToplist(players);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by lasting injuries suffered',
          description: '1. Griff Oberwald — 4',
        },
      ],
    });
  });

  it('passes the era id through to the query', async () => {
    const countLastingInjuriesSufferedByPlayer = vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 2 }]);
    const players = {
      countLastingInjuriesSufferedByPlayer,
    } as unknown as PlayersService;
    await resolvePlayerLastingInjuriesSufferedToplist(players, 20);
    expect(countLastingInjuriesSufferedByPlayer).toHaveBeenCalledWith(20);
  });

  it('falls back to "I am stunned" when the query does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const players = {
        countLastingInjuriesSufferedByPlayer: vi
          .fn()
          .mockReturnValue(new Promise(() => {})),
      } as unknown as PlayersService;
      const promise = resolvePlayerLastingInjuriesSufferedToplist(players);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});
