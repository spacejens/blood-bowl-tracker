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
import {
  expectLeaderboardEmbed,
  expectStunnedOnTimeout,
} from './toplist.test-helpers';

interface PlayerCase {
  describeName: string;
  method: keyof PlayersService;
  resolve: (players: PlayersService, eraId?: number) => Promise<unknown>;
  rows: { playerId: number; name: string; count: number }[];
  title: string;
  description: string;
  eraRows: { playerId: number; name: string; count: number }[];
}

const cases: PlayerCase[] = [
  {
    describeName: 'resolvePlayerMvpsToplist',
    method: 'countMvpAwardsByPlayer',
    resolve: (players, eraId) => resolvePlayerMvpsToplist(players, eraId),
    rows: [
      { playerId: 1, name: 'Griff Oberwald', count: 7 },
      { playerId: 2, name: 'Morg n Thorg', count: 7 },
      { playerId: 3, name: 'Zug', count: 3 },
    ],
    title: 'Players by MVP awards',
    description: '1. Griff Oberwald — 7\n1. Morg n Thorg — 7\n2. Zug — 3',
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 3 }],
  },
  {
    describeName: 'resolvePlayerTouchdownsScoredToplist',
    method: 'countTouchdownsScoredByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerTouchdownsScoredToplist(players, eraId),
    rows: [
      { playerId: 1, name: 'Griff Oberwald', count: 9 },
      { playerId: 2, name: 'Zug', count: 9 },
      { playerId: 3, name: 'Morg n Thorg', count: 4 },
    ],
    title: 'Players by touchdowns scored',
    description: '1. Griff Oberwald — 9\n1. Zug — 9\n2. Morg n Thorg — 4',
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 3 }],
  },
  {
    describeName: 'resolvePlayerCompletionsToplist',
    method: 'countCompletionsByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerCompletionsToplist(players, eraId),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 6 }],
    title: 'Players by completions',
    description: '1. Griff Oberwald — 6',
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
  },
  {
    describeName: 'resolvePlayerInterceptionsToplist',
    method: 'countInterceptionsByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerInterceptionsToplist(players, eraId),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 5 }],
    title: 'Players by interceptions',
    description: '1. Griff Oberwald — 5',
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
  },
  {
    describeName: 'resolvePlayerDeflectionsToplist',
    method: 'countDeflectionsByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerDeflectionsToplist(players, eraId),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 4 }],
    title: 'Players by deflections',
    description: '1. Griff Oberwald — 4',
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
  },
  {
    describeName: 'resolvePlayerCasualtiesCausedToplist',
    method: 'countCasualtiesCausedByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerCasualtiesCausedToplist(players, eraId),
    rows: [
      { playerId: 1, name: 'Morg n Thorg', count: 11 },
      { playerId: 2, name: 'Grashnak Blackhoof', count: 11 },
      { playerId: 3, name: 'Griff Oberwald', count: 4 },
    ],
    title: 'Players by casualties inflicted',
    description:
      '1. Morg n Thorg — 11\n1. Grashnak Blackhoof — 11\n2. Griff Oberwald — 4',
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 3 }],
  },
  {
    describeName: 'resolvePlayerSeriousInjuriesCausedToplist',
    method: 'countSeriousInjuriesCausedByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerSeriousInjuriesCausedToplist(players, eraId),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 3 }],
    title: 'Players by serious injuries inflicted',
    description: '1. Morg n Thorg — 3',
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
  },
  {
    describeName: 'resolvePlayerDeathsCausedToplist',
    method: 'countDeathsCausedByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerDeathsCausedToplist(players, eraId),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    title: 'Players by opponents killed',
    description: '1. Morg n Thorg — 2',
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
  },
  {
    describeName: 'resolvePlayerFoulsCommittedToplist',
    method: 'countFoulsCommittedByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerFoulsCommittedToplist(players, eraId),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 6 }],
    title: 'Players by fouls committed',
    description: '1. Morg n Thorg — 6',
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
  },
  {
    describeName: 'resolvePlayerTimesSentOffToplist',
    method: 'countTimesSentOffByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerTimesSentOffToplist(players, eraId),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 5 }],
    title: 'Players by times sent off',
    description: '1. Morg n Thorg — 5',
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
  },
  {
    describeName: 'resolvePlayerCasualtiesSufferedToplist',
    method: 'countCasualtiesSufferedByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerCasualtiesSufferedToplist(players, eraId),
    rows: [
      { playerId: 1, name: 'Griff Oberwald', count: 12 },
      { playerId: 2, name: 'Zug', count: 12 },
      { playerId: 3, name: 'Morg n Thorg', count: 3 },
    ],
    title: 'Players by casualties suffered',
    description: '1. Griff Oberwald — 12\n1. Zug — 12\n2. Morg n Thorg — 3',
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 3 }],
  },
  {
    describeName: 'resolvePlayerSeriousInjuriesSufferedToplist',
    method: 'countSeriousInjuriesSufferedByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerSeriousInjuriesSufferedToplist(players, eraId),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 5 }],
    title: 'Players by serious injuries suffered',
    description: '1. Griff Oberwald — 5',
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
  },
  {
    describeName: 'resolvePlayerLastingInjuriesSufferedToplist',
    method: 'countLastingInjuriesSufferedByPlayer',
    resolve: (players, eraId) =>
      resolvePlayerLastingInjuriesSufferedToplist(players, eraId),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 4 }],
    title: 'Players by lasting injuries suffered',
    description: '1. Griff Oberwald — 4',
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
  },
];

describe.each(cases)(
  '$describeName',
  ({ method, resolve, rows, title, description, eraRows }) => {
    it('returns a leaderboard embed built from the query rows', async () => {
      const players = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as PlayersService;
      const result = await resolve(players);
      expectLeaderboardEmbed(result, title, description);
    });

    it('passes the era id through to the query', async () => {
      const queryFn = vi.fn().mockResolvedValue(eraRows);
      const players = { [method]: queryFn } as unknown as PlayersService;
      await resolve(players, 20);
      expect(queryFn).toHaveBeenCalledWith(20);
    });

    it('falls back to "I am stunned" when the query does not respond in time', async () => {
      await expectStunnedOnTimeout(
        (players: PlayersService) => resolve(players),
        () =>
          ({
            [method]: vi.fn().mockReturnValue(new Promise(() => {})),
          }) as unknown as PlayersService,
      );
    });
  },
);
