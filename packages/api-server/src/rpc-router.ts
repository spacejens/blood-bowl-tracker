import { implement } from '@orpc/server';
import { contract } from '@blood-bowl-tracker/api-contract';
import {
  CoachUpsertConflictError,
  type CoachesService,
  type ExternalSystemsService,
} from '@blood-bowl-tracker/game-data';

export function buildRpcRouter(
  coachesService: CoachesService,
  externalSystemsService: ExternalSystemsService,
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
