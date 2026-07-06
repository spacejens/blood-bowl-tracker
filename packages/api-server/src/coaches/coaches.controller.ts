import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { CoachesService, CoachUpsertConflictError } from './coaches.service';

@Controller()
export class CoachesController {
  constructor(private readonly coachesService: CoachesService) {}

  @Implement(contract.coaches)
  handler() {
    return {
      list: implement(contract.coaches.list).handler(() =>
        this.coachesService.findAll(),
      ),
      getById: implement(contract.coaches.getById).handler(
        async ({ input, errors }) => {
          const coach = await this.coachesService.findById(input.id);
          if (!coach) throw errors.NOT_FOUND({ message: 'Coach not found' });
          return coach;
        },
      ),
      create: implement(contract.coaches.create).handler(({ input }) =>
        this.coachesService.create(input),
      ),
      upsert: implement(contract.coaches.upsert).handler(
        async ({ input, errors }) => {
          try {
            const { coach, created } = await this.coachesService.upsert(input);
            return { ...coach, created };
          } catch (err) {
            if (err instanceof CoachUpsertConflictError) {
              throw errors.CONFLICT({ message: err.message });
            }
            throw err;
          }
        },
      ),
    };
  }
}
