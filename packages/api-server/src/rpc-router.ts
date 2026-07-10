import { contract } from '@blood-bowl-tracker/api-contract';
import {
  type CoachesService,
  CoachUpsertConflictError,
  type ErasService,
  EraUpsertConflictError,
  type ExternalSystemsService,
  type LeaguesService,
  LeagueUpsertConflictError,
  type RacesService,
  RaceUpsertConflictError,
  type RulesSetsService,
  RulesSetUpsertConflictError,
  type TeamsService,
  TeamUpsertConflictError,
} from '@blood-bowl-tracker/game-data';
import { implement } from '@orpc/server';

export function buildRpcRouter(
  coachesService: CoachesService,
  externalSystemsService: ExternalSystemsService,
  leaguesService: LeaguesService,
  racesService: RacesService,
  rulesSetsService: RulesSetsService,
  erasService: ErasService,
  teamsService: TeamsService,
) {
  return {
    coaches: {
      upsert: implement(contract.coaches.upsert).handler(
        async ({ input, errors }) => {
          try {
            const { coach, created } = await coachesService.upsert(input);
            return { ...coach, created };
          } catch (err) {
            if (err instanceof CoachUpsertConflictError) {
              throw errors.CONFLICT({ message: err.message });
            }
            throw err;
          }
        },
      ),
    },
    leagues: {
      upsert: implement(contract.leagues.upsert).handler(
        async ({ input, errors }) => {
          try {
            const { league, created } = await leaguesService.upsert(input);
            return { ...league, created };
          } catch (err) {
            if (err instanceof LeagueUpsertConflictError) {
              throw errors.CONFLICT({ message: err.message });
            }
            throw err;
          }
        },
      ),
    },
    races: {
      upsert: implement(contract.races.upsert).handler(
        async ({ input, errors }) => {
          try {
            const { race, created } = await racesService.upsert(input);
            return { ...race, created };
          } catch (err) {
            if (err instanceof RaceUpsertConflictError) {
              throw errors.CONFLICT({ message: err.message });
            }
            throw err;
          }
        },
      ),
    },
    rulesSets: {
      upsert: implement(contract.rulesSets.upsert).handler(
        async ({ input, errors }) => {
          try {
            const { rulesSet, created } = await rulesSetsService.upsert(input);
            return { ...rulesSet, created };
          } catch (err) {
            if (err instanceof RulesSetUpsertConflictError) {
              throw errors.CONFLICT({ message: err.message });
            }
            throw err;
          }
        },
      ),
    },
    eras: {
      upsert: implement(contract.eras.upsert).handler(
        async ({ input, errors }) => {
          try {
            const { era, created } = await erasService.upsert(input);
            return { ...era, created };
          } catch (err) {
            if (err instanceof EraUpsertConflictError) {
              throw errors.CONFLICT({ message: err.message });
            }
            throw err;
          }
        },
      ),
    },
    teams: {
      upsert: implement(contract.teams.upsert).handler(
        async ({ input, errors }) => {
          try {
            const { team, created } = await teamsService.upsert(input);
            return { ...team, created };
          } catch (err) {
            if (err instanceof TeamUpsertConflictError) {
              throw errors.CONFLICT({ message: err.message });
            }
            throw err;
          }
        },
      ),
    },
    externalSystems: {
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
