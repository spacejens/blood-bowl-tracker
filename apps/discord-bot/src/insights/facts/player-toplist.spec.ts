import type { PlayersService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { PLAYER_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import { PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../slash-commands/deepdive-command.service';
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
import { expectTimeoutFallback } from './toplist.test-helpers';

interface PlayerCase {
  describeName: string;
  method: keyof PlayersService;
  resolve: (
    players: PlayersService,
    eraId?: number,
    competitionId?: number,
  ) => Promise<unknown>;
  rows: { playerId: number; name: string; count: number }[];
  eraRows: { playerId: number; name: string; count: number }[];
  competitionRows?: { playerId: number; name: string; count: number }[];
  expectedTitle: string;
  expectedDescription: string;
}

const cases: PlayerCase[] = [
  {
    describeName: 'resolvePlayerMvpsToplist',
    method: 'countMvpAwardsByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerMvpsToplist(players, eraId, competitionId),
    rows: [
      { playerId: 1, name: 'Griff Oberwald', count: 7 },
      { playerId: 2, name: 'Morg n Thorg', count: 7 },
      { playerId: 3, name: 'Zug', count: 3 },
    ],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 3 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    expectedTitle: 'Players by MVP awards',
    expectedDescription:
      '1. Griff Oberwald — 7\n1. Morg n Thorg — 7\n2. Zug — 3',
  },
  {
    describeName: 'resolvePlayerTouchdownsScoredToplist',
    method: 'countTouchdownsScoredByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerTouchdownsScoredToplist(players, eraId, competitionId),
    rows: [
      { playerId: 1, name: 'Griff Oberwald', count: 9 },
      { playerId: 2, name: 'Zug', count: 9 },
      { playerId: 3, name: 'Morg n Thorg', count: 4 },
    ],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 3 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    expectedTitle: 'Players by touchdowns scored',
    expectedDescription:
      '1. Griff Oberwald — 9\n1. Zug — 9\n2. Morg n Thorg — 4',
  },
  {
    describeName: 'resolvePlayerCompletionsToplist',
    method: 'countCompletionsByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerCompletionsToplist(players, eraId, competitionId),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 6 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by completions',
    expectedDescription: '1. Griff Oberwald — 6',
  },
  {
    describeName: 'resolvePlayerInterceptionsToplist',
    method: 'countInterceptionsByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerInterceptionsToplist(players, eraId, competitionId),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 5 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by interceptions',
    expectedDescription: '1. Griff Oberwald — 5',
  },
  {
    describeName: 'resolvePlayerDeflectionsToplist',
    method: 'countDeflectionsByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerDeflectionsToplist(players, eraId, competitionId),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 4 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by deflections',
    expectedDescription: '1. Griff Oberwald — 4',
  },
  {
    describeName: 'resolvePlayerCasualtiesCausedToplist',
    method: 'countCasualtiesCausedByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerCasualtiesCausedToplist(players, eraId, competitionId),
    rows: [
      { playerId: 1, name: 'Morg n Thorg', count: 11 },
      { playerId: 2, name: 'Grashnak Blackhoof', count: 11 },
      { playerId: 3, name: 'Griff Oberwald', count: 4 },
    ],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 3 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    expectedTitle: 'Players by casualties inflicted',
    expectedDescription:
      '1. Morg n Thorg — 11\n1. Grashnak Blackhoof — 11\n2. Griff Oberwald — 4',
  },
  {
    describeName: 'resolvePlayerSeriousInjuriesCausedToplist',
    method: 'countSeriousInjuriesCausedByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerSeriousInjuriesCausedToplist(players, eraId, competitionId),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 3 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by serious injuries inflicted',
    expectedDescription: '1. Morg n Thorg — 3',
  },
  {
    describeName: 'resolvePlayerDeathsCausedToplist',
    method: 'countDeathsCausedByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerDeathsCausedToplist(players, eraId, competitionId),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by opponents killed',
    expectedDescription: '1. Morg n Thorg — 2',
  },
  {
    describeName: 'resolvePlayerFoulsCommittedToplist',
    method: 'countFoulsCommittedByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerFoulsCommittedToplist(players, eraId, competitionId),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 6 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by fouls committed',
    expectedDescription: '1. Morg n Thorg — 6',
  },
  {
    describeName: 'resolvePlayerTimesSentOffToplist',
    method: 'countTimesSentOffByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerTimesSentOffToplist(players, eraId, competitionId),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 5 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by times sent off',
    expectedDescription: '1. Morg n Thorg — 5',
  },
  {
    describeName: 'resolvePlayerCasualtiesSufferedToplist',
    method: 'countCasualtiesSufferedByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerCasualtiesSufferedToplist(players, eraId, competitionId),
    rows: [
      { playerId: 1, name: 'Griff Oberwald', count: 12 },
      { playerId: 2, name: 'Zug', count: 12 },
      { playerId: 3, name: 'Morg n Thorg', count: 3 },
    ],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 3 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    expectedTitle: 'Players by casualties suffered',
    expectedDescription:
      '1. Griff Oberwald — 12\n1. Zug — 12\n2. Morg n Thorg — 3',
  },
  {
    describeName: 'resolvePlayerSeriousInjuriesSufferedToplist',
    method: 'countSeriousInjuriesSufferedByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerSeriousInjuriesSufferedToplist(
        players,
        eraId,
        competitionId,
      ),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 5 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by serious injuries suffered',
    expectedDescription: '1. Griff Oberwald — 5',
  },
  {
    describeName: 'resolvePlayerLastingInjuriesSufferedToplist',
    method: 'countLastingInjuriesSufferedByPlayer',
    resolve: (players, eraId, competitionId) =>
      resolvePlayerLastingInjuriesSufferedToplist(
        players,
        eraId,
        competitionId,
      ),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 4 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by lasting injuries suffered',
    expectedDescription: '1. Griff Oberwald — 4',
  },
];

describe.each(cases)(
  '$describeName',
  ({
    method,
    resolve,
    rows,
    expectedTitle,
    expectedDescription,
    eraRows,
    competitionRows,
  }) => {
    it('returns a leaderboard embed with one deepdive button per player row', async () => {
      const players = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as PlayersService;
      const result = (await resolve(players)) as {
        embeds: { title: string; description: string }[];
        components: { components: { label: string; custom_id: string }[] }[];
      };
      expect(result.embeds).toEqual([
        { title: expectedTitle, description: expectedDescription },
      ]);
      const buttons = result.components.flatMap((row) => row.components);
      expect(buttons.map((b) => b.custom_id)).toEqual(
        rows.map((r) => `${PLAYER_BUTTON_CUSTOM_ID_PREFIX}${r.playerId}`),
      );
      expect(buttons.map((b) => b.label)).toEqual(rows.map((r) => r.name));
    });

    it('passes the era id through to the query', async () => {
      const queryFn = vi.fn().mockResolvedValue(eraRows);
      const players = { [method]: queryFn } as unknown as PlayersService;
      await resolve(players, 20);
      expect(queryFn).toHaveBeenCalledWith(20, undefined);
    });

    if (competitionRows) {
      it('passes the competition id through to the query', async () => {
        const queryFn = vi.fn().mockResolvedValue(competitionRows);
        const players = { [method]: queryFn } as unknown as PlayersService;
        await resolve(players, undefined, 30);
        expect(queryFn).toHaveBeenCalledWith(undefined, 30);
      });
    }

    it('falls back to the timeout message when the query does not respond in time', async () => {
      await expectTimeoutFallback(
        (players: PlayersService) => resolve(players),
        () =>
          ({
            [method]: vi.fn().mockReturnValue(new Promise(() => {})),
          }) as unknown as PlayersService,
        PLAYER_TOPLIST_TIMEOUT_MESSAGE,
      );
    });
  },
);
