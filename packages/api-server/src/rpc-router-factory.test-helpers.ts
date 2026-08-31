import {
  CoachesService,
  CompetitionGroupsService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  MatchEventsService,
  MatchOutcomesService,
  PlayersService,
  PositionRulesSetsService,
  PositionsService,
  RacesService,
  RulesSetsService,
  SppAdjustmentsService,
  SppAwardValuesService,
  TeamsService,
  TrophiesService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { mock } from 'vitest-mock-extended';

import { RpcRouterFactoryService } from './rpc-router-factory.service';
import { UpsertHandlerService } from './upsert-handler.service';

/**
 * Builds the real router with every `game-data` service mocked, and the real
 * `UpsertHandlerService`. That service is pure and dependency-free — it has
 * no constructor, no injected collaborators and no I/O, only exception
 * classification — so passing the real instance carries none of the coupling
 * risk the "never pass a real collaborator" rule guards against, and it means
 * these specs contain no copy of its classification logic to drift from it.
 * Its own behavior is covered in isolation by `upsert-handler.service.spec.ts`.
 */
export async function createRouterHarness() {
  const mocks = {
    coachesService: mock<CoachesService>(),
    externalSystemsService: mock<ExternalSystemsService>(),
    leaguesService: mock<LeaguesService>(),
    racesService: mock<RacesService>(),
    rulesSetsService: mock<RulesSetsService>(),
    erasService: mock<ErasService>(),
    positionsService: mock<PositionsService>(),
    positionRulesSetsService: mock<PositionRulesSetsService>(),
    teamsService: mock<TeamsService>(),
    trophiesService: mock<TrophiesService>(),
    trophyAwardsService: mock<TrophyAwardsService>(),
    competitionGroupsService: mock<CompetitionGroupsService>(),
    competitionsService: mock<CompetitionsService>(),
    matchesService: mock<MatchesService>(),
    matchOutcomesService: mock<MatchOutcomesService>(),
    playersService: mock<PlayersService>(),
    matchEventsService: mock<MatchEventsService>(),
    sppAdjustmentsService: mock<SppAdjustmentsService>(),
    sppAwardValuesService: mock<SppAwardValuesService>(),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      RpcRouterFactoryService,
      { provide: CoachesService, useValue: mocks.coachesService },
      {
        provide: ExternalSystemsService,
        useValue: mocks.externalSystemsService,
      },
      { provide: LeaguesService, useValue: mocks.leaguesService },
      { provide: RacesService, useValue: mocks.racesService },
      { provide: RulesSetsService, useValue: mocks.rulesSetsService },
      { provide: ErasService, useValue: mocks.erasService },
      { provide: PositionsService, useValue: mocks.positionsService },
      {
        provide: PositionRulesSetsService,
        useValue: mocks.positionRulesSetsService,
      },
      { provide: TeamsService, useValue: mocks.teamsService },
      { provide: TrophiesService, useValue: mocks.trophiesService },
      { provide: TrophyAwardsService, useValue: mocks.trophyAwardsService },
      {
        provide: CompetitionGroupsService,
        useValue: mocks.competitionGroupsService,
      },
      { provide: CompetitionsService, useValue: mocks.competitionsService },
      { provide: MatchesService, useValue: mocks.matchesService },
      { provide: MatchOutcomesService, useValue: mocks.matchOutcomesService },
      { provide: PlayersService, useValue: mocks.playersService },
      { provide: MatchEventsService, useValue: mocks.matchEventsService },
      {
        provide: SppAdjustmentsService,
        useValue: mocks.sppAdjustmentsService,
      },
      {
        provide: SppAwardValuesService,
        useValue: mocks.sppAwardValuesService,
      },
      UpsertHandlerService,
    ],
  }).compile();

  return { router: moduleRef.get(RpcRouterFactoryService).build(), mocks };
}
