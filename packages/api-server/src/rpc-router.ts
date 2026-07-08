import { implement } from '@orpc/server';
import { contract } from '@blood-bowl-tracker/api-contract';
import {
  CoachUpsertConflictError,
  LeagueUpsertConflictError,
  type CoachesService,
  type ExternalSystemsService,
  type LeaguesService,
} from '@blood-bowl-tracker/game-data';

export function buildRpcRouter(
  coachesService: CoachesService,
  externalSystemsService: ExternalSystemsService,
  leaguesService: LeaguesService,
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
