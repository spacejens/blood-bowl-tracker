import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  FACT_SCOPE_ALL_TIME,
  PlayersService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { PLAYER_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import { PlayerContextService } from '../player-context.service';
import { passthroughPlayerContext } from '../player-context-mock.test-helpers';
import { PlayerToplistService } from './player-toplist.service';
import { ToplistFactoryService } from './toplist-factory.service';
import type { ToplistFactoryMock } from './toplist-factory-mock.test-helpers';
import { mockToplistFactory } from './toplist-factory-mock.test-helpers';

type PlayerRow = {
  playerId: number;
  name: string;
  count: number;
  contextSuffix?: string;
};

interface MadeService {
  service: PlayerToplistService;
  toplist: ToplistFactoryMock<PlayerCountMethod, PlayerRow>;
}

async function makeService(
  players: PlayersService,
  playerContext: MockProxy<PlayerContextService> = passthroughPlayerContext(),
): Promise<MadeService> {
  const toplist = mockToplistFactory<PlayerCountMethod, PlayerRow>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerToplistService,
      { provide: PlayersService, useValue: players },
      { provide: PlayerContextService, useValue: playerContext },
      { provide: ToplistFactoryService, useValue: toplist.factory },
    ],
  }).compile();
  return { service: moduleRef.get(PlayerToplistService), toplist };
}

type PlayerCountMethod =
  | 'countMvpAwardsByPlayer'
  | 'countTouchdownsScoredByPlayer'
  | 'countCompletionsByPlayer'
  | 'countInterceptionsByPlayer'
  | 'countDeflectionsByPlayer'
  | 'countCasualtiesCausedByPlayer'
  | 'countSeriousInjuriesCausedByPlayer'
  | 'countDeathsCausedByPlayer'
  | 'countFoulsCommittedByPlayer'
  | 'countTimesSentOffByPlayer'
  | 'countCasualtiesSufferedByPlayer'
  | 'countSeriousInjuriesSufferedByPlayer'
  | 'countLastingInjuriesSufferedByPlayer'
  | 'topPlayersByTotalSpp';

interface PlayerCase {
  describeName: string;
  method: PlayerCountMethod;
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
  {
    describeName: 'resolveTotalSpp',
    method: 'topPlayersByTotalSpp',
    resolve: (service, scope) => service.resolveTotalSpp(scope),
    rows: [
      { playerId: 1, name: 'Griff Oberwald', count: 128 },
      { playerId: 2, name: 'Morg n Thorg', count: 128 },
      { playerId: 3, name: 'Zug', count: 96 },
    ],
    eraRows: [{ playerId: 1, name: 'Griff Oberwald', count: 44 }],
    competitionRows: [{ playerId: 1, name: 'Griff Oberwald', count: 12 }],
    expectedTitle: 'Players by total SPP',
  },
];

describe.each(cases)(
  'PlayerToplistService.$describeName',
  ({ method, resolve, rows, expectedTitle, eraRows, competitionRows }) => {
    // The resolver-to-LeaderboardService binding is ToplistFactoryService's
    // job, covered by toplist-factory.service.spec.ts. Here the factory is a
    // mock handing back inert resolvers, so these tests assert only what
    // PlayerToplistService itself owns: the options it configures (title,
    // entityLink, messages, decorateRows, formatRow) and the resolver it
    // delegates each public method to.
    it('wires the embed title and per-row deepdive button id', async () => {
      const players = mock<PlayersService>();
      const { service, toplist } = await makeService(players);
      const canned = {
        embeds: [{ title: 'canned', description: 'canned' }],
      };
      toplist.resolver(method).mockResolvedValueOnce(canned);
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(canned);
      const options = toplist.options();
      expect(options.titles[method]).toBe(expectedTitle);
      expect(options.entityLink?.customIdPrefix).toBe(
        PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      );
      expect(options.entityLink?.entityId(rows[0])).toBe(rows[0].playerId);
    });

    it('passes the era scope through to the factory resolver', async () => {
      const players = mock<PlayersService>();
      const { service, toplist } = await makeService(players);
      await resolve(service, { eraId: 20 });
      expect(toplist.resolver(method)).toHaveBeenCalledWith(players, {
        eraId: 20,
      });
    });

    if (competitionRows) {
      it('passes the competition scope through to the factory resolver', async () => {
        const players = mock<PlayersService>();
        const { service, toplist } = await makeService(players);
        await resolve(service, { competitionId: 30 });
        expect(toplist.resolver(method)).toHaveBeenCalledWith(players, {
          competitionId: 30,
        });
      });
    }

    it('configures the toplist-specific timeout message and returns the resolver reply verbatim', async () => {
      const players = mock<PlayersService>();
      const { service, toplist } = await makeService(players);
      toplist
        .resolver(method)
        .mockResolvedValueOnce(PLAYER_TOPLIST_TIMEOUT_MESSAGE);
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(PLAYER_TOPLIST_TIMEOUT_MESSAGE);
      expect(toplist.options().timeoutMessage).toBe(
        PLAYER_TOPLIST_TIMEOUT_MESSAGE,
      );
    });

    it('decorates every fetched row with position, team, race, era and coach when the toplist is not era-scoped', async () => {
      const players = mock<PlayersService>();
      const playerContext = mock<PlayerContextService>();
      playerContext.attachSuffixes.mockResolvedValue(
        rows.map((row) => ({ ...row, contextSuffix: ' (decorated)' })),
      );
      const { toplist } = await makeService(players, playerContext);
      const decorated = await toplist
        .options()
        .decorateRows?.(rows, FACT_SCOPE_ALL_TIME);
      expect(playerContext.attachSuffixes).toHaveBeenCalledTimes(1);
      const [inputRows, playerIdOf, contextOptions] =
        playerContext.attachSuffixes.mock.calls[0];
      expect(inputRows).toEqual(rows);
      expect(playerIdOf(rows[0])).toBe(rows[0].playerId);
      expect(contextOptions).toEqual({
        includePosition: true,
        includeTeam: true,
        includeRace: true,
        includeEra: true,
        includeCoach: true,
      });
      expect(decorated).toEqual(
        rows.map((row) => ({ ...row, contextSuffix: ' (decorated)' })),
      );
    });

    it('leaves the era out of the row context when the toplist is era-scoped', async () => {
      const players = mock<PlayersService>();
      const playerContext = mock<PlayerContextService>();
      playerContext.attachSuffixes.mockResolvedValue(
        eraRows.map((row) => ({ ...row, contextSuffix: '' })),
      );
      const { toplist } = await makeService(players, playerContext);
      await toplist.options().decorateRows?.(eraRows, { eraId: 20 });
      const [, , contextOptions] = playerContext.attachSuffixes.mock.calls[0];
      expect(contextOptions).toEqual({
        includePosition: true,
        includeTeam: true,
        includeRace: true,
        includeEra: false,
        includeCoach: true,
      });
    });

    it('renders each row with its context suffix between the name and the count', async () => {
      const players = mock<PlayersService>();
      const { toplist } = await makeService(players);
      expect(
        toplist.options().formatRow?.({
          ...rows[0],
          contextSuffix: ' (Blitzer, Reikland Reavers, Human, Roze Madder)',
          rank: 3,
        }),
      ).toBe(
        `3. ${rows[0].name} (Blitzer, Reikland Reavers, Human, Roze Madder) — ${rows[0].count}`,
      );
    });

    it('renders a row with no known context without stray parentheses', async () => {
      const players = mock<PlayersService>();
      const { toplist } = await makeService(players);
      expect(
        toplist
          .options()
          .formatRow?.({ ...rows[0], contextSuffix: '', rank: 1 }),
      ).toBe(`1. ${rows[0].name} — ${rows[0].count}`);
    });
  },
);
