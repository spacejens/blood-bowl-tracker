import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { RacesService } from './races.service';

@Controller()
export class RacesController {
  constructor(private readonly racesService: RacesService) {}

  @TsRestHandler(contract.races)
  async handler(): Promise<any> {
    return tsRestHandler(contract.races, {
      list: async () => ({
        status: 200 as const,
        body: await this.racesService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const race = await this.racesService.findById(id);
        if (!race) return { status: 404 as const, body: { message: 'Race not found' } };
        return { status: 200 as const, body: race };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.racesService.create(body),
      }),
    });
  }
}
