import type { PlayersService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  resolvePlayerCompletionsToplist,
  resolvePlayerDeflectionsToplist,
  resolvePlayerInterceptionsToplist,
  resolvePlayerMvpsToplist,
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
