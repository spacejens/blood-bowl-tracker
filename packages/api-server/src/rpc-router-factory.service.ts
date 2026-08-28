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
  ResolveBatchRouteOptions,
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

  build() {
    return {
      coaches: {
        ...this.buildUpsertRoute({
          procedure: contract.coaches.upsert,
          service: this.coachesService,
          conflictError: CoachUpsertConflictError,
          unwrap: (r) => ({ entity: r.coach, created: r.created }),
        }),
        upsertBatch: implement(contract.coaches.upsertBatch).handler(
          ({ input }) =>
            this.upsertHandler.runBatch(
              CoachUpsertConflictError,
              input.map((item) => async () => {
                const { coach, created } =
                  await this.coachesService.upsert(item);
                return { entity: coach, created };
              }),
            ),
        ),
        ...this.buildResolveRoute({
          procedure: contract.coaches.resolve,
          service: this.coachesService,
        }),
        ...this.buildResolveBatchRoute({
          procedure: contract.coaches.resolveBatch,
          service: this.coachesService,
        }),
      },
      leagues: {
        ...this.buildUpsertRoute({
          procedure: contract.leagues.upsert,
          service: this.leaguesService,
          conflictError: LeagueUpsertConflictError,
          unwrap: (r) => ({ entity: r.league, created: r.created }),
        }),
        upsertBatch: implement(contract.leagues.upsertBatch).handler(
          ({ input }) =>
            this.upsertHandler.runBatch(
              LeagueUpsertConflictError,
              input.map((item) => async () => {
                const { league, created } =
                  await this.leaguesService.upsert(item);
                return { entity: league, created };
              }),
            ),
        ),
        ...this.buildResolveRoute({
          procedure: contract.leagues.resolve,
          service: this.leaguesService,
        }),
        ...this.buildResolveBatchRoute({
          procedure: contract.leagues.resolveBatch,
          service: this.leaguesService,
        }),
      },
      races: {
        ...this.buildUpsertRoute({
          procedure: contract.races.upsert,
          service: this.racesService,
          conflictError: RaceUpsertConflictError,
          unwrap: (r) => ({ entity: r.race, created: r.created }),
        }),
        upsertBatch: implement(contract.races.upsertBatch).handler(
          ({ input }) =>
            this.upsertHandler.runBatch(
              RaceUpsertConflictError,
              input.map((item) => async () => {
                const { race, created } = await this.racesService.upsert(item);
                return { entity: race, created };
              }),
            ),
        ),
        ...this.buildResolveRoute({
          procedure: contract.races.resolve,
          service: this.racesService,
        }),
        ...this.buildResolveBatchRoute({
          procedure: contract.races.resolveBatch,
          service: this.racesService,
        }),
      },
      players: {
        ...this.buildUpsertRoute({
          procedure: contract.players.upsert,
          service: this.playersService,
          conflictError: PlayerUpsertConflictError,
          unwrap: (r) => ({ entity: r.player, created: r.created }),
        }),
        upsertBatch: implement(contract.players.upsertBatch).handler(
          ({ input }) =>
            this.upsertHandler.runBatch(
              PlayerUpsertConflictError,
              input.map((item) => async () => {
                const { player, created } =
                  await this.playersService.upsert(item);
                return { entity: player, created };
              }),
            ),
        ),
        ...buildPlayerSppAdjustmentRoutes(this.sppAdjustmentsService),
      },
      positions: {
        ...this.buildUpsertRoute({
          procedure: contract.positions.upsert,
          service: this.positionsService,
          conflictError: PositionUpsertConflictError,
          unwrap: (r) => ({ entity: r.position, created: r.created }),
        }),
        upsertBatch: implement(contract.positions.upsertBatch).handler(
          ({ input }) =>
            this.upsertHandler.runBatch(
              PositionUpsertConflictError,
              input.map((item) => async () => {
                const { position, created } =
                  await this.positionsService.upsert(item);
                return { entity: position, created };
              }),
            ),
        ),
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
      rulesSets: {
        ...this.buildUpsertRoute({
          procedure: contract.rulesSets.upsert,
          service: this.rulesSetsService,
          conflictError: RulesSetUpsertConflictError,
          unwrap: (r) => ({ entity: r.rulesSet, created: r.created }),
        }),
        upsertBatch: implement(contract.rulesSets.upsertBatch).handler(
          ({ input }) =>
            this.upsertHandler.runBatch(
              RulesSetUpsertConflictError,
              input.map((item) => async () => {
                const { rulesSet, created } =
                  await this.rulesSetsService.upsert(item);
                return { entity: rulesSet, created };
              }),
            ),
        ),
        ...this.buildResolveRoute({
          procedure: contract.rulesSets.resolve,
          service: this.rulesSetsService,
        }),
        ...this.buildResolveBatchRoute({
          procedure: contract.rulesSets.resolveBatch,
          service: this.rulesSetsService,
        }),
      },
      sppAwardValues: buildSppAwardValuesRoutes(this.sppAwardValuesService),
      eras: {
        ...this.buildUpsertRoute({
          procedure: contract.eras.upsert,
          service: this.erasService,
          conflictError: EraUpsertConflictError,
          unwrap: (r) => ({ entity: r.era, created: r.created }),
        }),
        upsertBatch: implement(contract.eras.upsertBatch).handler(({ input }) =>
          this.upsertHandler.runBatch(
            EraUpsertConflictError,
            input.map((item) => async () => {
              const { era, created } = await this.erasService.upsert(item);
              return { entity: era, created };
            }),
          ),
        ),
        ...this.buildResolveRoute({
          procedure: contract.eras.resolve,
          service: this.erasService,
        }),
        ...this.buildResolveBatchRoute({
          procedure: contract.eras.resolveBatch,
          service: this.erasService,
        }),
      },
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
      competitions: {
        ...this.buildUpsertRoute({
          procedure: contract.competitions.upsert,
          service: this.competitionsService,
          conflictError: CompetitionUpsertConflictError,
          unwrap: (r) => ({ entity: r.competition, created: r.created }),
        }),
        upsertBatch: implement(contract.competitions.upsertBatch).handler(
          ({ input }) =>
            this.upsertHandler.runBatch(
              CompetitionUpsertConflictError,
              input.map((item) => async () => {
                const { competition, created } =
                  await this.competitionsService.upsert(item);
                return { entity: competition, created };
              }),
            ),
        ),
        ...this.buildResolveRoute({
          procedure: contract.competitions.resolve,
          service: this.competitionsService,
        }),
        ...this.buildResolveBatchRoute({
          procedure: contract.competitions.resolveBatch,
          service: this.competitionsService,
        }),
      },
      matches: {
        ...this.buildUpsertRoute({
          procedure: contract.matches.upsert,
          service: this.matchesService,
          conflictError: MatchUpsertConflictError,
          unwrap: (r) => ({ entity: r.match, created: r.created }),
        }),
        upsertBatch: implement(contract.matches.upsertBatch).handler(
          ({ input }) =>
            this.upsertHandler.runBatch(
              MatchUpsertConflictError,
              input.map((item) => async () => {
                const { match, created } =
                  await this.matchesService.upsert(item);
                return { entity: match, created };
              }),
            ),
        ),
        ...buildMatchResolveOutcomesRoute(this.matchOutcomes),
      },
      matchEvents: {
        ...this.buildUpsertRoute({
          procedure: contract.matchEvents.upsert,
          service: this.matchEventsService,
          conflictError: MatchEventUpsertConflictError,
          unwrap: (r) => ({ entity: r.matchEvent, created: r.created }),
        }),
        upsertBatch: implement(contract.matchEvents.upsertBatch).handler(
          ({ input }) =>
            this.upsertHandler.runBatch(
              MatchEventUpsertConflictError,
              input.map((item) => async () => {
                const { matchEvent, created } =
                  await this.matchEventsService.upsert(item);
                return { entity: matchEvent, created };
              }),
            ),
        ),
      },
      teams: {
        ...this.buildUpsertRoute({
          procedure: contract.teams.upsert,
          service: this.teamsService,
          conflictError: TeamUpsertConflictError,
          unwrap: (r) => ({ entity: r.team, created: r.created }),
        }),
        upsertBatch: implement(contract.teams.upsertBatch).handler(
          ({ input }) =>
            this.upsertHandler.runBatch(
              TeamUpsertConflictError,
              input.map((item) => async () => {
                const { team, created } = await this.teamsService.upsert(item);
                return { entity: team, created };
              }),
            ),
        ),
        ...this.buildResolveRoute({
          procedure: contract.teams.resolve,
          service: this.teamsService,
        }),
        ...this.buildResolveBatchRoute({
          procedure: contract.teams.resolveBatch,
          service: this.teamsService,
        }),
      },
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
