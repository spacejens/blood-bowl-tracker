import { contract } from '@blood-bowl-tracker/api-contract';
import {
  CoachesService,
  CoachUpsertConflictError,
  CompetitionGroupsService,
  CompetitionGroupUpsertConflictError,
  CompetitionsService,
  CompetitionUpsertConflictError,
  ErasService,
  EraUpsertConflictError,
  ExternalSystemsService,
  LeaguesService,
  LeagueUpsertConflictError,
  MatchesService,
  MatchEventsService,
  MatchEventUpsertConflictError,
  MatchOutcomesService,
  MatchUpsertConflictError,
  PlayersService,
  PlayerUpsertConflictError,
  PositionsService,
  PositionUpsertConflictError,
  RacesService,
  RaceUpsertConflictError,
  RulesSetsService,
  RulesSetUpsertConflictError,
  SppAdjustmentsService,
  SppAwardValuesService,
  TeamsService,
  TeamUpsertConflictError,
  TrophiesService,
  TrophyAwardsService,
  TrophyUpsertConflictError,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type {
  AnySchema,
  ContractProcedure,
  ErrorMap,
  InferSchemaInput,
  Meta,
} from '@orpc/contract';
import { implement } from '@orpc/server';

import {
  buildCompetitionGroupsListRoute,
  buildExternalSystemsRoutes,
  buildMatchResolveOutcomesRoute,
  buildPlayerSppAdjustmentRoutes,
  buildPositionSyncRaceErasRoute,
  buildSppAwardValuesRoutes,
  buildTrophyAwardsRoutes,
} from './rpc-router-factory-hand-written-routes';
import type {
  ResolvableService,
  ResolveBatchProcedure,
  ResolveBatchRouteOptions,
  ResolveProcedure,
  ResolveRouteOptions,
} from './rpc-router-factory-types';
import type { ConflictErrors } from './upsert-handler.service';
import { UpsertHandlerService } from './upsert-handler.service';

/**
 * Assembles the oRPC router and supplies it through DI (the `RPC_ROUTER`
 * token) rather than composing it inside `RpcMiddleware`'s constructor. The
 * many-arg constructor is allowed: NestJS DI constructors are exempt from the
 * max-params rule.
 */
@Injectable()
export class RpcRouterFactoryService {
  constructor(
    private readonly coachesService: CoachesService,
    private readonly externalSystemsService: ExternalSystemsService,
    private readonly leaguesService: LeaguesService,
    private readonly racesService: RacesService,
    private readonly rulesSetsService: RulesSetsService,
    private readonly sppAwardValuesService: SppAwardValuesService,
    private readonly sppAdjustmentsService: SppAdjustmentsService,
    private readonly erasService: ErasService,
    private readonly positionsService: PositionsService,
    private readonly teamsService: TeamsService,
    private readonly competitionGroupsService: CompetitionGroupsService,
    private readonly competitionsService: CompetitionsService,
    private readonly matchesService: MatchesService,
    private readonly matchOutcomes: MatchOutcomesService,
    private readonly playersService: PlayersService,
    private readonly matchEventsService: MatchEventsService,
    private readonly trophiesService: TrophiesService,
    private readonly trophyAwardsService: TrophyAwardsService,
    private readonly upsertHandler: UpsertHandlerService,
  ) {}

  /**
   * One entity's upsert route, as a one-key object to spread into its block
   * in build(). unwrap pulls the entity and its created flag out of the
   * service's own differently-named result shape without any game-data
   * return shape changing.
   *
   * The two casts are unavoidable and safe: inside a generic body TypeScript
   * cannot resolve InferSchemaInput<TOutputSchema> or the handler's
   * error-constructor map, but every call site instantiates them concretely,
   * so the router type build() returns is exactly what a hand-written
   * implement(...).handler(...) would produce, and oRPC still validates the
   * handler's output against the contract's schema at runtime.
   */
  private buildUpsertRoute<
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
    TMeta extends Meta,
    TInput,
    TResult,
    TEntity extends object,
  >(options: {
    procedure: ContractProcedure<TInputSchema, TOutputSchema, TErrorMap, TMeta>;
    service: { upsert(input: TInput): Promise<TResult> };
    conflictError: abstract new (...args: never[]) => Error;
    unwrap: (result: TResult) => { entity: TEntity; created: boolean };
  }) {
    return {
      upsert: implement(options.procedure).handler(
        async ({ input, errors }) => {
          const result = await this.upsertHandler.run(
            errors as unknown as ConflictErrors,
            options.conflictError,
            async () =>
              options.unwrap(
                await options.service.upsert(input as unknown as TInput),
              ),
          );
          return result as unknown as InferSchemaInput<TOutputSchema>;
        },
      ),
    };
  }

  /**
   * The batch counterpart of buildUpsertRoute. A per-item domain failure
   * becomes that item's failure entry rather than a thrown contract error --
   * see UpsertHandlerService.runBatch. The casts are the same
   * deferred-generic ones buildUpsertRoute explains.
   */
  private buildUpsertBatchRoute<
    TInputSchema extends AnySchema,
    TOutputSchema extends AnySchema,
    TErrorMap extends ErrorMap,
    TMeta extends Meta,
    TInput,
    TResult,
    TEntity extends object,
  >(options: {
    procedure: ContractProcedure<TInputSchema, TOutputSchema, TErrorMap, TMeta>;
    service: { upsert(input: TInput): Promise<TResult> };
    conflictError: abstract new (...args: never[]) => Error;
    unwrap: (result: TResult) => { entity: TEntity; created: boolean };
  }) {
    return {
      upsertBatch: implement(options.procedure).handler(async ({ input }) => {
        const items = input as unknown as TInput[];
        const results = await this.upsertHandler.runBatch(
          options.conflictError,
          items.map(
            (item) => async () =>
              options.unwrap(await options.service.upsert(item)),
          ),
        );
        return results as unknown as InferSchemaInput<TOutputSchema>;
      }),
    };
  }

  // One entity's resolve route, as a one-key object to spread into its block
  // in build(). No domain error to translate — a miss is a normal result.
  private buildResolveRoute(options: ResolveRouteOptions) {
    return {
      resolve: implement(options.procedure).handler(({ input }) =>
        options.service.resolve(input),
      ),
    };
  }

  // The batch counterpart of buildResolveRoute.
  private buildResolveBatchRoute(options: ResolveBatchRouteOptions) {
    return {
      resolveBatch: implement(options.procedure).handler(({ input }) =>
        options.service.resolveBatch(input),
      ),
    };
  }

  /**
   * All four routes for an entity whose contract and game-data service are an
   * exact match of the standard shape — nothing more, nothing less. An entity
   * that is a strict subset or superset (players, positions,
   * competitionGroups, matches, matchEvents, trophies) composes the individual
   * builders instead and hand-writes what is left, so the extra or missing
   * procedure stays visible at its own block.
   *
   * The resolve procedures are one concrete type across every entity, so only
   * the two upsert procedures need their schema generics carried through.
   */
  private buildStandardEntityRoutes<
    TUpsertIn extends AnySchema,
    TUpsertOut extends AnySchema,
    TUpsertErr extends ErrorMap,
    TUpsertMeta extends Meta,
    TBatchIn extends AnySchema,
    TBatchOut extends AnySchema,
    TBatchErr extends ErrorMap,
    TBatchMeta extends Meta,
    TInput,
    TResult,
    TEntity extends object,
  >(options: {
    procedures: {
      upsert: ContractProcedure<TUpsertIn, TUpsertOut, TUpsertErr, TUpsertMeta>;
      upsertBatch: ContractProcedure<
        TBatchIn,
        TBatchOut,
        TBatchErr,
        TBatchMeta
      >;
      resolve: ResolveProcedure;
      resolveBatch: ResolveBatchProcedure;
    };
    service: { upsert(input: TInput): Promise<TResult> } & ResolvableService;
    conflictError: abstract new (...args: never[]) => Error;
    unwrap: (result: TResult) => { entity: TEntity; created: boolean };
  }) {
    return {
      ...this.buildUpsertRoute({
        procedure: options.procedures.upsert,
        service: options.service,
        conflictError: options.conflictError,
        unwrap: options.unwrap,
      }),
      ...this.buildUpsertBatchRoute({
        procedure: options.procedures.upsertBatch,
        service: options.service,
        conflictError: options.conflictError,
        unwrap: options.unwrap,
      }),
      ...this.buildResolveRoute({
        procedure: options.procedures.resolve,
        service: options.service,
      }),
      ...this.buildResolveBatchRoute({
        procedure: options.procedures.resolveBatch,
        service: options.service,
      }),
    };
  }

  build() {
    return {
      coaches: this.buildStandardEntityRoutes({
        procedures: contract.coaches,
        service: this.coachesService,
        conflictError: CoachUpsertConflictError,
        unwrap: (r) => ({ entity: r.coach, created: r.created }),
      }),
      leagues: this.buildStandardEntityRoutes({
        procedures: contract.leagues,
        service: this.leaguesService,
        conflictError: LeagueUpsertConflictError,
        unwrap: (r) => ({ entity: r.league, created: r.created }),
      }),
      races: this.buildStandardEntityRoutes({
        procedures: contract.races,
        service: this.racesService,
        conflictError: RaceUpsertConflictError,
        unwrap: (r) => ({ entity: r.race, created: r.created }),
      }),
      players: {
        ...this.buildUpsertRoute({
          procedure: contract.players.upsert,
          service: this.playersService,
          conflictError: PlayerUpsertConflictError,
          unwrap: (r) => ({ entity: r.player, created: r.created }),
        }),
        ...this.buildUpsertBatchRoute({
          procedure: contract.players.upsertBatch,
          service: this.playersService,
          conflictError: PlayerUpsertConflictError,
          unwrap: (r) => ({ entity: r.player, created: r.created }),
        }),
        ...buildPlayerSppAdjustmentRoutes(this.sppAdjustmentsService),
      },
      positions: {
        ...this.buildUpsertRoute({
          procedure: contract.positions.upsert,
          service: this.positionsService,
          conflictError: PositionUpsertConflictError,
          unwrap: (r) => ({ entity: r.position, created: r.created }),
        }),
        ...this.buildUpsertBatchRoute({
          procedure: contract.positions.upsertBatch,
          service: this.positionsService,
          conflictError: PositionUpsertConflictError,
          unwrap: (r) => ({ entity: r.position, created: r.created }),
        }),
        ...buildPositionSyncRaceErasRoute(this.positionsService),
        ...this.buildResolveRoute({
          procedure: contract.positions.resolve,
          service: this.positionsService,
        }),
        ...this.buildResolveBatchRoute({
          procedure: contract.positions.resolveBatch,
          service: this.positionsService,
        }),
      },
      rulesSets: this.buildStandardEntityRoutes({
        procedures: contract.rulesSets,
        service: this.rulesSetsService,
        conflictError: RulesSetUpsertConflictError,
        unwrap: (r) => ({ entity: r.rulesSet, created: r.created }),
      }),
      sppAwardValues: buildSppAwardValuesRoutes(this.sppAwardValuesService),
      eras: this.buildStandardEntityRoutes({
        procedures: contract.eras,
        service: this.erasService,
        conflictError: EraUpsertConflictError,
        unwrap: (r) => ({ entity: r.era, created: r.created }),
      }),
      competitionGroups: {
        ...this.buildUpsertRoute({
          procedure: contract.competitionGroups.upsert,
          service: this.competitionGroupsService,
          conflictError: CompetitionGroupUpsertConflictError,
          unwrap: (r) => ({ entity: r.competitionGroup, created: r.created }),
        }),
        ...this.buildResolveRoute({
          procedure: contract.competitionGroups.resolve,
          service: this.competitionGroupsService,
        }),
        ...this.buildResolveBatchRoute({
          procedure: contract.competitionGroups.resolveBatch,
          service: this.competitionGroupsService,
        }),
        ...buildCompetitionGroupsListRoute(this.competitionGroupsService),
      },
      competitions: this.buildStandardEntityRoutes({
        procedures: contract.competitions,
        service: this.competitionsService,
        conflictError: CompetitionUpsertConflictError,
        unwrap: (r) => ({ entity: r.competition, created: r.created }),
      }),
      matches: {
        ...this.buildUpsertRoute({
          procedure: contract.matches.upsert,
          service: this.matchesService,
          conflictError: MatchUpsertConflictError,
          unwrap: (r) => ({ entity: r.match, created: r.created }),
        }),
        ...this.buildUpsertBatchRoute({
          procedure: contract.matches.upsertBatch,
          service: this.matchesService,
          conflictError: MatchUpsertConflictError,
          unwrap: (r) => ({ entity: r.match, created: r.created }),
        }),
        ...buildMatchResolveOutcomesRoute(this.matchOutcomes),
      },
      matchEvents: {
        ...this.buildUpsertRoute({
          procedure: contract.matchEvents.upsert,
          service: this.matchEventsService,
          conflictError: MatchEventUpsertConflictError,
          unwrap: (r) => ({ entity: r.matchEvent, created: r.created }),
        }),
        ...this.buildUpsertBatchRoute({
          procedure: contract.matchEvents.upsertBatch,
          service: this.matchEventsService,
          conflictError: MatchEventUpsertConflictError,
          unwrap: (r) => ({ entity: r.matchEvent, created: r.created }),
        }),
      },
      teams: this.buildStandardEntityRoutes({
        procedures: contract.teams,
        service: this.teamsService,
        conflictError: TeamUpsertConflictError,
        unwrap: (r) => ({ entity: r.team, created: r.created }),
      }),
      trophies: {
        // Only `upsert`: the contract defines no `upsertBatch` for trophies
        // (29 curated rows, imported one at a time by tools/import-manual).
        ...this.buildUpsertRoute({
          procedure: contract.trophies.upsert,
          service: this.trophiesService,
          conflictError: TrophyUpsertConflictError,
          unwrap: (r) => ({ entity: r.trophy, created: r.created }),
        }),
      },
      trophyAwards: buildTrophyAwardsRoutes(
        this.upsertHandler,
        this.trophyAwardsService,
      ),
      externalSystems: buildExternalSystemsRoutes(
        this.upsertHandler,
        this.externalSystemsService,
      ),
    };
  }
}
