import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  FACT_SCOPE_ALL_TIME,
  PlayersService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { PLAYER_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { PlayerToplistService } from './player-toplist.service';

interface MadeService {
  service: PlayerToplistService;
  leaderboard: MockProxy<LeaderboardService>;
}

async function makeService(players: PlayersService): Promise<MadeService> {
  const leaderboard = mock<LeaderboardService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerToplistService,
      { provide: PlayersService, useValue: players },
      { provide: LeaderboardService, useValue: leaderboard },
    ],
  }).compile();
  return { service: moduleRef.get(PlayerToplistService), leaderboard };
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
  },
  {
    describeName: 'resolveCompletions',
    method: 'countCompletionsByPlayer',
    resolve: (service, scope) => service.resolveCompletions(scope),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 6 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by completions',
  },
  {
    describeName: 'resolveInterceptions',
    method: 'countInterceptionsByPlayer',
    resolve: (service, scope) => service.resolveInterceptions(scope),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 5 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by interceptions',
  },
  {
    describeName: 'resolveDeflections',
    method: 'countDeflectionsByPlayer',
    resolve: (service, scope) => service.resolveDeflections(scope),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 4 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by deflections',
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
  },
  {
    describeName: 'resolveSeriousInjuriesCaused',
    method: 'countSeriousInjuriesCausedByPlayer',
    resolve: (service, scope) => service.resolveSeriousInjuriesCaused(scope),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 3 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by serious injuries inflicted',
  },
  {
    describeName: 'resolveDeathsCaused',
    method: 'countDeathsCausedByPlayer',
    resolve: (service, scope) => service.resolveDeathsCaused(scope),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by opponents killed',
  },
  {
    describeName: 'resolveFoulsCommitted',
    method: 'countFoulsCommittedByPlayer',
    resolve: (service, scope) => service.resolveFoulsCommitted(scope),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 6 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by fouls committed',
  },
  {
    describeName: 'resolveTimesSentOff',
    method: 'countTimesSentOffByPlayer',
    resolve: (service, scope) => service.resolveTimesSentOff(scope),
    rows: [{ playerId: 1, name: 'Morg n Thorg', count: 5 }],
    eraRows: [{ playerId: 1, name: 'Morg n Thorg', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Morg n Thorg', count: 1 }],
    expectedTitle: 'Players by times sent off',
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
  },
  {
    describeName: 'resolveSeriousInjuriesSuffered',
    method: 'countSeriousInjuriesSufferedByPlayer',
    resolve: (service, scope) => service.resolveSeriousInjuriesSuffered(scope),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 5 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by serious injuries suffered',
  },
  {
    describeName: 'resolveLastingInjuriesSuffered',
    method: 'countLastingInjuriesSufferedByPlayer',
    resolve: (service, scope) => service.resolveLastingInjuriesSuffered(scope),
    rows: [{ playerId: 1, name: 'Griff Oberwald', count: 4 }],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 2 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 1 }],
    expectedTitle: 'Players by lasting injuries suffered',
  },
];

describe.each(cases)(
  'PlayerToplistService.$describeName',
  ({ method, resolve, rows, expectedTitle, eraRows, competitionRows }) => {
    // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
    // rendering) is covered by leaderboard.service.spec.ts. Here `leaderboard`
    // is a mock returning a canned reply, so this test only asserts what
    // PlayerToplistService itself owns: the embed title it configures, and the
    // per-row deepdive entityLink it configures.
    it('wires the embed title and per-row deepdive button id', async () => {
      const players = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as PlayersService;
      const { service, leaderboard } = await makeService(players);
      const canned = {
        embeds: [{ title: 'canned', description: 'canned' }],
      };
      leaderboard.resolveToplist.mockResolvedValueOnce(canned);
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(canned);
      const options = leaderboard.resolveToplist.mock
        .calls[0][0] as unknown as ResolveToplistOptions<(typeof rows)[number]>;
      expect(options.title).toBe(expectedTitle);
      expect(options.entityLink?.customIdPrefix).toBe(
        PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      );
      expect(options.entityLink?.entityId(rows[0])).toBe(rows[0].playerId);
    });

    it('passes the era id through to the query', async () => {
      const queryFn = vi.fn().mockResolvedValue(eraRows);
      const players = { [method]: queryFn } as unknown as PlayersService;
      const { service, leaderboard } = await makeService(players);
      leaderboard.resolveToplist.mockImplementation(async (options) => {
        await options.fetchRows(TOPLIST_FETCH_LIMIT);
        return 'canned';
      });
      await resolve(service, { eraId: 20 });
      expect(queryFn).toHaveBeenCalledWith({ eraId: 20 }, TOPLIST_FETCH_LIMIT);
    });

    if (competitionRows) {
      it('passes the competition id through to the query', async () => {
        const queryFn = vi.fn().mockResolvedValue(competitionRows);
        const players = { [method]: queryFn } as unknown as PlayersService;
        const { service, leaderboard } = await makeService(players);
        leaderboard.resolveToplist.mockImplementation(async (options) => {
          await options.fetchRows(TOPLIST_FETCH_LIMIT);
          return 'canned';
        });
        await resolve(service, { competitionId: 30 });
        expect(queryFn).toHaveBeenCalledWith(
          { competitionId: 30 },
          TOPLIST_FETCH_LIMIT,
        );
      });
    }

    it('configures the toplist-specific timeout message and returns it verbatim on timeout', async () => {
      const players = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as PlayersService;
      const { service, leaderboard } = await makeService(players);
      leaderboard.resolveToplist.mockResolvedValueOnce(
        PLAYER_TOPLIST_TIMEOUT_MESSAGE,
      );
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(PLAYER_TOPLIST_TIMEOUT_MESSAGE);
      expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMessage: PLAYER_TOPLIST_TIMEOUT_MESSAGE,
        }),
      );
    });
  },
);
