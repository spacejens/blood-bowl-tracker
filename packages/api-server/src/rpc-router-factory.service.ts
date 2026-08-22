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
import { implement } from '@orpc/server';

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

  build() {
    return {
      coaches: {
        upsert: implement(contract.coaches.upsert).handler(
          ({ input, errors }) =>
            this.upsertHandler.run(
              errors,
              CoachUpsertConflictError,
              async () => {
                const { coach, created } =
                  await this.coachesService.upsert(input);
                return { entity: coach, created };
              },
            ),
        ),
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
        // Resolve handlers call the entity service directly rather than
        // through UpsertHandlerService: a resolve has no domain error to
        // translate into a contract error — a miss is a normal result.
        resolve: implement(contract.coaches.resolve).handler(({ input }) =>
          this.coachesService.resolve(input),
        ),
        resolveBatch: implement(contract.coaches.resolveBatch).handler(
          ({ input }) => this.coachesService.resolveBatch(input),
        ),
      },
      leagues: {
        upsert: implement(contract.leagues.upsert).handler(
          ({ input, errors }) =>
            this.upsertHandler.run(
              errors,
              LeagueUpsertConflictError,
              async () => {
                const { league, created } =
                  await this.leaguesService.upsert(input);
                return { entity: league, created };
              },
            ),
        ),
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
        resolve: implement(contract.leagues.resolve).handler(({ input }) =>
          this.leaguesService.resolve(input),
        ),
        resolveBatch: implement(contract.leagues.resolveBatch).handler(
          ({ input }) => this.leaguesService.resolveBatch(input),
        ),
      },
      races: {
        upsert: implement(contract.races.upsert).handler(({ input, errors }) =>
          this.upsertHandler.run(errors, RaceUpsertConflictError, async () => {
            const { race, created } = await this.racesService.upsert(input);
            return { entity: race, created };
          }),
        ),
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
        resolve: implement(contract.races.resolve).handler(({ input }) =>
          this.racesService.resolve(input),
        ),
        resolveBatch: implement(contract.races.resolveBatch).handler(
          ({ input }) => this.racesService.resolveBatch(input),
        ),
      },
      players: {
        upsert: implement(contract.players.upsert).handler(
          ({ input, errors }) =>
            this.upsertHandler.run(
              errors,
              PlayerUpsertConflictError,
              async () => {
                const { player, created } =
                  await this.playersService.upsert(input);
                return { entity: player, created };
              },
            ),
        ),
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
        // Not routed through the upsert handler, for the same reason
        // sppAwardValues.sync is not: no external-id conflict to map and no
        // entity+created shape to return.
        syncScrapedSppAdjustments: implement(
          contract.players.syncScrapedSppAdjustments,
        ).handler(({ input }) =>
          this.sppAdjustmentsService.syncScrapedAdjustments(input),
        ),
        syncReportedSppAdjustments: implement(
          contract.players.syncReportedSppAdjustments,
        ).handler(({ input }) =>
          this.sppAdjustmentsService.syncReportedAdjustments(input),
        ),
      },
      positions: {
        upsert: implement(contract.positions.upsert).handler(
          ({ input, errors }) =>
            this.upsertHandler.run(
              errors,
              PositionUpsertConflictError,
              async () => {
                const { position, created } =
                  await this.positionsService.upsert(input);
                return { entity: position, created };
              },
            ),
        ),
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
        syncRaceEras: implement(contract.positions.syncRaceEras).handler(
          async ({ input }) => this.positionsService.syncRaceEras(input),
        ),
        resolve: implement(contract.positions.resolve).handler(({ input }) =>
          this.positionsService.resolve(input),
        ),
        resolveBatch: implement(contract.positions.resolveBatch).handler(
          ({ input }) => this.positionsService.resolveBatch(input),
        ),
      },
      rulesSets: {
        upsert: implement(contract.rulesSets.upsert).handler(
          ({ input, errors }) =>
            this.upsertHandler.run(
              errors,
              RulesSetUpsertConflictError,
              async () => {
                const { rulesSet, created } =
                  await this.rulesSetsService.upsert(input);
                return { entity: rulesSet, created };
              },
            ),
        ),
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
        resolve: implement(contract.rulesSets.resolve).handler(({ input }) =>
          this.rulesSetsService.resolve(input),
        ),
        resolveBatch: implement(contract.rulesSets.resolveBatch).handler(
          ({ input }) => this.rulesSetsService.resolveBatch(input),
        ),
      },
      sppAwardValues: {
        // Not routed through the upsert handler: award values are keyed by
        // (rulesSetId, raceId, actionType) rather than external ids, so there
        // is no CONFLICT error to map and no entity+created shape to return
        // — same shape as positions.syncRaceEras.
        sync: implement(contract.sppAwardValues.sync).handler(({ input }) =>
          this.sppAwardValuesService.sync(input),
        ),
      },
      eras: {
        upsert: implement(contract.eras.upsert).handler(({ input, errors }) =>
          this.upsertHandler.run(errors, EraUpsertConflictError, async () => {
            const { era, created } = await this.erasService.upsert(input);
            return { entity: era, created };
          }),
        ),
        upsertBatch: implement(contract.eras.upsertBatch).handler(({ input }) =>
          this.upsertHandler.runBatch(
            EraUpsertConflictError,
            input.map((item) => async () => {
              const { era, created } = await this.erasService.upsert(item);
              return { entity: era, created };
            }),
          ),
        ),
        resolve: implement(contract.eras.resolve).handler(({ input }) =>
          this.erasService.resolve(input),
        ),
        resolveBatch: implement(contract.eras.resolveBatch).handler(
          ({ input }) => this.erasService.resolveBatch(input),
        ),
      },
      competitionGroups: {
        upsert: implement(contract.competitionGroups.upsert).handler(
          ({ input, errors }) =>
            this.upsertHandler.run(
              errors,
              CompetitionGroupUpsertConflictError,
              async () => {
                const { competitionGroup, created } =
                  await this.competitionGroupsService.upsert(input);
                return { entity: competitionGroup, created };
              },
            ),
        ),
        resolve: implement(contract.competitionGroups.resolve).handler(
          ({ input }) => this.competitionGroupsService.resolve(input),
        ),
        resolveBatch: implement(
          contract.competitionGroups.resolveBatch,
        ).handler(({ input }) =>
          this.competitionGroupsService.resolveBatch(input),
        ),
        list: implement(contract.competitionGroups.list).handler(async () => {
          const groups = await this.competitionGroupsService.listAll();
          // Mapped explicitly rather than returned raw: the drizzle row also
          // carries the history-tracking columns, which are not part of the
          // contract's CompetitionGroupSchema.
          return groups.map((group) => ({
            id: group.id,
            name: group.name,
            leagueId: group.leagueId,
            createdAt: group.createdAt,
          }));
        }),
      },
      competitions: {
        upsert: implement(contract.competitions.upsert).handler(
          ({ input, errors }) =>
            this.upsertHandler.run(
              errors,
              CompetitionUpsertConflictError,
              async () => {
                const { competition, created } =
                  await this.competitionsService.upsert(input);
                return { entity: competition, created };
              },
            ),
        ),
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
        resolve: implement(contract.competitions.resolve).handler(({ input }) =>
          this.competitionsService.resolve(input),
        ),
        resolveBatch: implement(contract.competitions.resolveBatch).handler(
          ({ input }) => this.competitionsService.resolveBatch(input),
        ),
      },
      matches: {
        upsert: implement(contract.matches.upsert).handler(
          ({ input, errors }) =>
            this.upsertHandler.run(
              errors,
              MatchUpsertConflictError,
              async () => {
                const { match, created } =
                  await this.matchesService.upsert(input);
                return { entity: match, created };
              },
            ),
        ),
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
        // Not routed through the upsert handler: this procedure has no
        // CONFLICT/BAD_REQUEST error to map — a match whose outcome cannot be
        // determined comes back in `unresolvedMatchIds` for the caller to
        // report, rather than as a thrown error.
        resolveOutcomes: implement(contract.matches.resolveOutcomes).handler(
          async ({ input }) => this.matchOutcomes.resolveForCompetition(input),
        ),
      },
      matchEvents: {
        upsert: implement(contract.matchEvents.upsert).handler(
          ({ input, errors }) =>
            this.upsertHandler.run(
              errors,
              MatchEventUpsertConflictError,
              async () => {
                const { matchEvent, created } =
                  await this.matchEventsService.upsert(input);
                return { entity: matchEvent, created };
              },
            ),
        ),
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
        upsert: implement(contract.teams.upsert).handler(({ input, errors }) =>
          this.upsertHandler.run(errors, TeamUpsertConflictError, async () => {
            const { team, created } = await this.teamsService.upsert(input);
            return { entity: team, created };
          }),
        ),
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
        resolve: implement(contract.teams.resolve).handler(({ input }) =>
          this.teamsService.resolve(input),
        ),
        resolveBatch: implement(contract.teams.resolveBatch).handler(
          ({ input }) => this.teamsService.resolveBatch(input),
        ),
      },
      trophies: {
        // Only `upsert`: the contract defines no `upsertBatch` for trophies
        // (29 curated rows, imported one at a time by tools/import-manual).
        upsert: implement(contract.trophies.upsert).handler(
          ({ input, errors }) =>
            this.upsertHandler.run(
              errors,
              TrophyUpsertConflictError,
              async () => {
                const { trophy, created } =
                  await this.trophiesService.upsert(input);
                return { entity: trophy, created };
              },
            ),
        ),
      },
      trophyAwards: {
        // Only `upsert`, matching the contract: award rows are few enough
        // that batching buys nothing. No conflict class: `trophy_awards` has
        // a database unique constraint on its natural key, so the dedup
        // lookup can never match more than one row. `runWithoutConflict`
        // still maps a recipient-kind mismatch to BAD_REQUEST.
        upsert: implement(contract.trophyAwards.upsert).handler(
          ({ input, errors }) =>
            this.upsertHandler.runWithoutConflict(errors, async () => {
              const { trophyAward, created } =
                await this.trophyAwardsService.upsert(input);
              return { entity: trophyAward, created };
            }),
        ),
      },
      externalSystems: {
        // The only upsert with no CONFLICT error in the contract: an external
        // system is looked up and matched by its name alone (see
        // ExternalSystemsService.upsert), so there is no ambiguity between
        // multiple existing rows for it to catch. Hand-written rather than
        // run through the upsert handler so the absence is deliberate and
        // visible.
        upsert: implement(contract.externalSystems.upsert).handler(
          async ({ input }) => {
            const { system, created } =
              await this.externalSystemsService.upsert(input);
            return { ...system, created };
          },
        ),
        // No conflict-error class, for the same reason its single-item
        // sibling declares no CONFLICT error: an external system is matched
        // by name alone, so there is no ambiguity between existing rows.
        // Passing `undefined` keeps that omission explicit while still
        // reusing the shared per-item failure handling.
        upsertBatch: implement(contract.externalSystems.upsertBatch).handler(
          ({ input }) =>
            this.upsertHandler.runBatch(
              undefined,
              input.map((item) => async () => {
                const { system, created } =
                  await this.externalSystemsService.upsert(item);
                return { entity: system, created };
              }),
            ),
        ),
      },
    };
  }
}
