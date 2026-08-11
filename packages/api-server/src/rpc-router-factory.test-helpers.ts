import {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchCategoryMismatchError,
  MatchesService,
  MatchEventsService,
  MatchOutcomesService,
  MissingRequiredFieldError,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  SppAwardValuesService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { mock } from 'vitest-mock-extended';

import { RpcRouterFactoryService } from './rpc-router-factory.service';
import type { ConflictErrors } from './upsert-handler.service';
import { UpsertHandlerService } from './upsert-handler.service';

/**
 * Builds the real router with every `game-data` service mocked and a mocked
 * `UpsertHandlerService` whose `run`/`runBatch` mirror the real
 * implementations (see `upsert-handler.service.ts` and its own spec, which
 * cover that logic in isolation). Mirroring is deliberate here — the same
 * exception `rpc-router-factory.service.spec.ts` already documents: these
 * specs verify how the factory wires each entity service and conflict-error
 * class into the handler, which a canned return value would erase.
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
    teamsService: mock<TeamsService>(),
    competitionsService: mock<CompetitionsService>(),
    matchesService: mock<MatchesService>(),
    matchOutcomesService: mock<MatchOutcomesService>(),
    playersService: mock<PlayersService>(),
    matchEventsService: mock<MatchEventsService>(),
    sppAwardValuesService: mock<SppAwardValuesService>(),
    upsertHandler: mock<UpsertHandlerService>(),
  };

  mocks.upsertHandler.run.mockImplementation(
    async (errors: ConflictErrors, conflictErrorClass, runUpsert) => {
      try {
        const { entity, created } = (await runUpsert()) as {
          entity: Record<string, unknown>;
          created: boolean;
        };
        return { ...entity, created };
      } catch (err) {
        if (err instanceof conflictErrorClass) {
          throw errors.CONFLICT({ message: err.message });
        }
        throw err;
      }
    },
  );

  mocks.upsertHandler.runBatch.mockImplementation(
    async (conflictErrorClass, items) => {
      const results: Record<string, unknown>[] = [];
      for (const runItem of items) {
        try {
          const { entity, created } = (await runItem()) as {
            entity: Record<string, unknown>;
            created: boolean;
          };
          results.push({ ...entity, success: true, created });
        } catch (err) {
          if (
            conflictErrorClass !== undefined &&
            err instanceof conflictErrorClass
          ) {
            results.push({ success: false, error: err.message });
            continue;
          }
          if (
            err instanceof MissingRequiredFieldError ||
            err instanceof MatchCategoryMismatchError
          ) {
            results.push({ success: false, error: err.message });
            continue;
          }
          throw err;
        }
      }
      return results as never;
    },
  );

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
      { provide: TeamsService, useValue: mocks.teamsService },
      { provide: CompetitionsService, useValue: mocks.competitionsService },
      { provide: MatchesService, useValue: mocks.matchesService },
      { provide: MatchOutcomesService, useValue: mocks.matchOutcomesService },
      { provide: PlayersService, useValue: mocks.playersService },
      { provide: MatchEventsService, useValue: mocks.matchEventsService },
      {
        provide: SppAwardValuesService,
        useValue: mocks.sppAwardValuesService,
      },
      { provide: UpsertHandlerService, useValue: mocks.upsertHandler },
    ],
  }).compile();

  return { router: moduleRef.get(RpcRouterFactoryService).build(), mocks };
}
