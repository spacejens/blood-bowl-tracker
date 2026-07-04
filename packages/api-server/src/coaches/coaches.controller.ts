import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { CoachesService, CoachUpsertConflictError } from './coaches.service';

@Controller()
export class CoachesController {
  constructor(private readonly coachesService: CoachesService) {}

  @TsRestHandler(contract.coaches)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/require-await
  async handler(): Promise<any> {
    return tsRestHandler(contract.coaches, {
      list: async () => ({
        status: 200 as const,
        body: await this.coachesService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const coach = await this.coachesService.findById(id);
        if (!coach)
          return { status: 404 as const, body: { message: 'Coach not found' } };
        return { status: 200 as const, body: coach };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.coachesService.create(body),
      }),
      upsert: async ({ body }) => {
        try {
          const { coach, created } = await this.coachesService.upsert(body);
          return created
            ? { status: 201 as const, body: coach }
            : { status: 200 as const, body: coach };
        } catch (err) {
          if (err instanceof CoachUpsertConflictError) {
            return { status: 409 as const, body: { message: err.message } };
          }
          throw err;
        }
      },
    });
  }
}
