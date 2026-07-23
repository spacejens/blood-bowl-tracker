import type { FactScope, PlayersService } from '@blood-bowl-tracker/game-data';
import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { PLAYER_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { PlayerToplistService } from './player-toplist.service';
import { expectTimeoutFallback } from './toplist.test-helpers';

function makeService(players: PlayersService): PlayerToplistService {
  return new PlayerToplistService(
    players,
    new LeaderboardService(new DatabaseTimeoutService()),
  );
}

interface PlayerCase {
  describeName: string;
  method: keyof PlayersService;
  resolve: (
    service: PlayerToplistService,
    scope: FactScope,
  ) => Promise<unknown>;
  rows: { playerId: number; name: string; count: number }[];
  eraRows: { playerId: number; name: string; count: number }[];
  competitionRows?: { playerId: number; name: string; count: number }[];
  expectedTitle: string;
  expectedDescription: string;
}

const cases: PlayerCase[] = [
  {
    describeName: 'resolveMvps',
    method: 'countMvpAwardsByPlayer',
    resolve: (service, scope) => service.resolveMvps(scope),
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
    describeName: 'resolveTouchdownsScored',
    method: 'countTouchdownsScoredByPlayer',
    resolve: (service, scope) => service.resolveTouchdownsScored(scope),
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
    describeName: 'resolveCompletions',
    method: 'countCompletionsByPlayer',
    resolve: (service, scope) => service.resolveCompletions(scope),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 6 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by completions',
    expectedDescription: '1. Griff Oberwald — 6',
  },
  {
    describeName: 'resolveInterceptions',
    method: 'countInterceptionsByPlayer',
    resolve: (service, scope) => service.resolveInterceptions(scope),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 5 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by interceptions',
    expectedDescription: '1. Griff Oberwald — 5',
  },
  {
    describeName: 'resolveDeflections',
    method: 'countDeflectionsByPlayer',
    resolve: (service, scope) => service.resolveDeflections(scope),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 4 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by deflections',
    expectedDescription: '1. Griff Oberwald — 4',
  },
  {
    describeName: 'resolveCasualtiesCaused',
    method: 'countCasualtiesCausedByPlayer',
    resolve: (service, scope) => service.resolveCasualtiesCaused(scope),
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
    describeName: 'resolveSeriousInjuriesCaused',
    method: 'countSeriousInjuriesCausedByPlayer',
    resolve: (service, scope) => service.resolveSeriousInjuriesCaused(scope),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 3 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by serious injuries inflicted',
    expectedDescription: '1. Morg n Thorg — 3',
  },
  {
    describeName: 'resolveDeathsCaused',
    method: 'countDeathsCausedByPlayer',
    resolve: (service, scope) => service.resolveDeathsCaused(scope),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by opponents killed',
    expectedDescription: '1. Morg n Thorg — 2',
  },
  {
    describeName: 'resolveFoulsCommitted',
    method: 'countFoulsCommittedByPlayer',
    resolve: (service, scope) => service.resolveFoulsCommitted(scope),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 6 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by fouls committed',
    expectedDescription: '1. Morg n Thorg — 6',
  },
  {
    describeName: 'resolveTimesSentOff',
    method: 'countTimesSentOffByPlayer',
    resolve: (service, scope) => service.resolveTimesSentOff(scope),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 5 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by times sent off',
    expectedDescription: '1. Morg n Thorg — 5',
  },
  {
    describeName: 'resolveCasualtiesSuffered',
    method: 'countCasualtiesSufferedByPlayer',
    resolve: (service, scope) => service.resolveCasualtiesSuffered(scope),
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
    describeName: 'resolveSeriousInjuriesSuffered',
    method: 'countSeriousInjuriesSufferedByPlayer',
    resolve: (service, scope) => service.resolveSeriousInjuriesSuffered(scope),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 5 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by serious injuries suffered',
    expectedDescription: '1. Griff Oberwald — 5',
  },
  {
    describeName: 'resolveLastingInjuriesSuffered',
    method: 'countLastingInjuriesSufferedByPlayer',
    resolve: (service, scope) => service.resolveLastingInjuriesSuffered(scope),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 4 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by lasting injuries suffered',
    expectedDescription: '1. Griff Oberwald — 4',
  },
];

describe.each(cases)(
  'PlayerToplistService.$describeName',
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
      const result = (await resolve(
        makeService(players),
        FACT_SCOPE_ALL_TIME,
      )) as {
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
      await resolve(makeService(players), { eraId: 20 });
      expect(queryFn).toHaveBeenCalledWith({ eraId: 20 }, TOPLIST_FETCH_LIMIT);
    });

    if (competitionRows) {
      it('passes the competition id through to the query', async () => {
        const queryFn = vi.fn().mockResolvedValue(competitionRows);
        const players = { [method]: queryFn } as unknown as PlayersService;
        await resolve(makeService(players), { competitionId: 30 });
        expect(queryFn).toHaveBeenCalledWith(
          { competitionId: 30 },
          TOPLIST_FETCH_LIMIT,
        );
      });
    }

    it('falls back to the timeout message when the query does not respond in time', async () => {
      await expectTimeoutFallback(
        (players: PlayersService) =>
          resolve(makeService(players), FACT_SCOPE_ALL_TIME),
        () =>
          ({
            [method]: vi.fn().mockReturnValue(new Promise(() => {})),
          }) as unknown as PlayersService,
        PLAYER_TOPLIST_TIMEOUT_MESSAGE,
      );
    });
  },
);
