import {
  CoachesService,
  CompetitionGroupsService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  KeywordsService,
  LeaguesService,
  MatchesService,
  MatchEventsService,
  MatchOutcomesService,
  MissingTrophyAwardsService,
  PlayerLastingInjuryBackfillService,
  PlayerSkillsService,
  PlayersService,
  PositionRulesSetKeywordsService,
  PositionRulesSetSkillsService,
  PositionRulesSetsService,
  PositionsService,
  RacesService,
  RulesSetsService,
  SkillRulesSetsService,
  SkillsService,
  SppAdjustmentsService,
  SppAwardValuesService,
  TeamsService,
  TrophiesService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import {
  TpCompetitionImportService,
  TpMatchImportService,
  TpOfficialTeamsImportService,
  TpRosterImportService,
} from '@blood-bowl-tracker/import-tp-live';
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
    positionRulesSetSkillsService: mock<PositionRulesSetSkillsService>(),
    positionRulesSetKeywordsService: mock<PositionRulesSetKeywordsService>(),
    playerSkillsService: mock<PlayerSkillsService>(),
    skillsService: mock<SkillsService>(),
    keywordsService: mock<KeywordsService>(),
    skillRulesSetsService: mock<SkillRulesSetsService>(),
    teamsService: mock<TeamsService>(),
    trophiesService: mock<TrophiesService>(),
    trophyAwardsService: mock<TrophyAwardsService>(),
    missingTrophyAwardsService: mock<MissingTrophyAwardsService>(),
    competitionGroupsService: mock<CompetitionGroupsService>(),
    competitionsService: mock<CompetitionsService>(),
    matchesService: mock<MatchesService>(),
    matchOutcomesService: mock<MatchOutcomesService>(),
    playersService: mock<PlayersService>(),
    matchEventsService: mock<MatchEventsService>(),
    sppAdjustmentsService: mock<SppAdjustmentsService>(),
    sppAwardValuesService: mock<SppAwardValuesService>(),
    playerLastingInjuryBackfillService:
      mock<PlayerLastingInjuryBackfillService>(),
    tpRosterImportService: mock<TpRosterImportService>(),
    tpMatchImportService: mock<TpMatchImportService>(),
    tpCompetitionImportService: mock<TpCompetitionImportService>(),
    tpOfficialTeamsImportService: mock<TpOfficialTeamsImportService>(),
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
      {
        provide: PositionRulesSetSkillsService,
        useValue: mocks.positionRulesSetSkillsService,
      },
      {
        provide: PositionRulesSetKeywordsService,
        useValue: mocks.positionRulesSetKeywordsService,
      },
      { provide: PlayerSkillsService, useValue: mocks.playerSkillsService },
      { provide: SkillsService, useValue: mocks.skillsService },
      { provide: KeywordsService, useValue: mocks.keywordsService },
      {
        provide: SkillRulesSetsService,
        useValue: mocks.skillRulesSetsService,
      },
      { provide: TeamsService, useValue: mocks.teamsService },
      { provide: TrophiesService, useValue: mocks.trophiesService },
      { provide: TrophyAwardsService, useValue: mocks.trophyAwardsService },
      {
        provide: MissingTrophyAwardsService,
        useValue: mocks.missingTrophyAwardsService,
      },
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
      {
        provide: PlayerLastingInjuryBackfillService,
        useValue: mocks.playerLastingInjuryBackfillService,
      },
      {
        provide: TpRosterImportService,
        useValue: mocks.tpRosterImportService,
      },
      {
        provide: TpMatchImportService,
        useValue: mocks.tpMatchImportService,
      },
      {
        provide: TpCompetitionImportService,
        useValue: mocks.tpCompetitionImportService,
      },
      {
        provide: TpOfficialTeamsImportService,
        useValue: mocks.tpOfficialTeamsImportService,
      },
      UpsertHandlerService,
    ],
  }).compile();

  return { router: moduleRef.get(RpcRouterFactoryService).build(), mocks };
}
