import { contract } from '@blood-bowl-tracker/api-contract';
import {
  type CoachesService,
  CoachUpsertConflictError,
  type CompetitionsService,
  CompetitionUpsertConflictError,
  type ErasService,
  EraUpsertConflictError,
  type ExternalSystemsService,
  type LeaguesService,
  LeagueUpsertConflictError,
  type MatchesService,
  type MatchEventsService,
  MatchEventUpsertConflictError,
  MatchUpsertConflictError,
  type PlayersService,
  PlayerUpsertConflictError,
  type PositionsService,
  PositionUpsertConflictError,
  type RacesService,
  RaceUpsertConflictError,
  type RulesSetsService,
  RulesSetUpsertConflictError,
  type TeamsService,
  TeamUpsertConflictError,
} from '@blood-bowl-tracker/game-data';
import { implement } from '@orpc/server';

import { runUpsert } from './upsert-handler';

export interface RpcServices {
  coachesService: CoachesService;
  externalSystemsService: ExternalSystemsService;
  leaguesService: LeaguesService;
  racesService: RacesService;
  rulesSetsService: RulesSetsService;
  erasService: ErasService;
  positionsService: PositionsService;
  teamsService: TeamsService;
  competitionsService: CompetitionsService;
  matchesService: MatchesService;
  playersService: PlayersService;
  matchEventsService: MatchEventsService;
}

export function buildRpcRouter(services: RpcServices) {
  const {
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
  } = services;
  return {
    coaches: {
      upsert: implement(contract.coaches.upsert).handler(({ input, errors }) =>
        runUpsert(errors, CoachUpsertConflictError, async () => {
          const { coach, created } = await coachesService.upsert(input);
          return { entity: coach, created };
        }),
      ),
    },
    leagues: {
      upsert: implement(contract.leagues.upsert).handler(({ input, errors }) =>
        runUpsert(errors, LeagueUpsertConflictError, async () => {
          const { league, created } = await leaguesService.upsert(input);
          return { entity: league, created };
        }),
      ),
    },
    races: {
      upsert: implement(contract.races.upsert).handler(({ input, errors }) =>
        runUpsert(errors, RaceUpsertConflictError, async () => {
          const { race, created } = await racesService.upsert(input);
          return { entity: race, created };
        }),
      ),
    },
    players: {
      upsert: implement(contract.players.upsert).handler(({ input, errors }) =>
        runUpsert(errors, PlayerUpsertConflictError, async () => {
          const { player, created } = await playersService.upsert(input);
          return { entity: player, created };
        }),
      ),
    },
    positions: {
      upsert: implement(contract.positions.upsert).handler(
        ({ input, errors }) =>
          runUpsert(errors, PositionUpsertConflictError, async () => {
            const { position, created } = await positionsService.upsert(input);
            return { entity: position, created };
          }),
      ),
      syncRaceEras: implement(contract.positions.syncRaceEras).handler(
        async ({ input }) => positionsService.syncRaceEras(input),
      ),
    },
    rulesSets: {
      upsert: implement(contract.rulesSets.upsert).handler(
        ({ input, errors }) =>
          runUpsert(errors, RulesSetUpsertConflictError, async () => {
            const { rulesSet, created } = await rulesSetsService.upsert(input);
            return { entity: rulesSet, created };
          }),
      ),
    },
    eras: {
      upsert: implement(contract.eras.upsert).handler(({ input, errors }) =>
        runUpsert(errors, EraUpsertConflictError, async () => {
          const { era, created } = await erasService.upsert(input);
          return { entity: era, created };
        }),
      ),
    },
    competitions: {
      upsert: implement(contract.competitions.upsert).handler(
        ({ input, errors }) =>
          runUpsert(errors, CompetitionUpsertConflictError, async () => {
            const { competition, created } =
              await competitionsService.upsert(input);
            return { entity: competition, created };
          }),
      ),
    },
    matches: {
      upsert: implement(contract.matches.upsert).handler(({ input, errors }) =>
        runUpsert(errors, MatchUpsertConflictError, async () => {
          const { match, created } = await matchesService.upsert(input);
          return { entity: match, created };
        }),
      ),
    },
    matchEvents: {
      upsert: implement(contract.matchEvents.upsert).handler(
        ({ input, errors }) =>
          runUpsert(errors, MatchEventUpsertConflictError, async () => {
            const { matchEvent, created } =
              await matchEventsService.upsert(input);
            return { entity: matchEvent, created };
          }),
      ),
    },
    teams: {
      upsert: implement(contract.teams.upsert).handler(({ input, errors }) =>
        runUpsert(errors, TeamUpsertConflictError, async () => {
          const { team, created } = await teamsService.upsert(input);
          return { entity: team, created };
        }),
      ),
    },
    externalSystems: {
      // The only upsert with no CONFLICT error in the contract: an external
      // system is looked up and matched by its name alone (see
      // ExternalSystemsService.upsert), so there is no ambiguity between
      // multiple existing rows for it to catch. Hand-written rather than run
      // through runUpsert so the absence is deliberate and visible.
      upsert: implement(contract.externalSystems.upsert).handler(
        async ({ input }) => {
          const { system, created } =
            await externalSystemsService.upsert(input);
          return { ...system, created };
        },
      ),
    },
  };
}
