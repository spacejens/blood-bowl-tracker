import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  MatchEventsService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./rpc-router', () => ({
  buildRpcRouter: vi.fn(),
}));

import { buildRpcRouter } from './rpc-router';
import { RpcRouterFactoryService } from './rpc-router-factory.service';

describe('RpcRouterFactoryService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('build() delegates to buildRpcRouter with the injected services and returns its result', () => {
    const buildRpcRouterMock = vi.mocked(buildRpcRouter);
    const mockRouter = { mock: 'router' } as unknown as ReturnType<
      typeof buildRpcRouter
    >;
    buildRpcRouterMock.mockReturnValue(mockRouter);

    const coachesService = {} as CoachesService;
    const externalSystemsService = {} as ExternalSystemsService;
    const leaguesService = {} as LeaguesService;
    const racesService = {} as RacesService;
    const rulesSetsService = {} as RulesSetsService;
    const erasService = {} as ErasService;
    const positionsService = {} as PositionsService;
    const teamsService = {} as TeamsService;
    const competitionsService = {} as CompetitionsService;
    const matchesService = {} as MatchesService;
    const playersService = {} as PlayersService;
    const matchEventsService = {} as MatchEventsService;

    const factory = new RpcRouterFactoryService(
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
      matchesService,
      playersService,
      matchEventsService,
    );

    const router = factory.build();

    expect(buildRpcRouterMock).toHaveBeenCalledTimes(1);
    expect(buildRpcRouterMock).toHaveBeenCalledWith({
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
      matchesService,
      playersService,
      matchEventsService,
    });
    expect(router).toEqual(mockRouter);
  });
});
