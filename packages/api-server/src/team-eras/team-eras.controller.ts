import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { TeamErasService } from './team-eras.service';

@Controller()
export class TeamErasController {
  constructor(private readonly teamErasService: TeamErasService) {}

  @TsRestHandler(contract.teamEras)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/require-await
  async handler(): Promise<any> {
    return tsRestHandler(contract.teamEras, {
      list: async () => ({
        status: 200 as const,
        body: await this.teamErasService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const teamEra = await this.teamErasService.findById(id);
        if (!teamEra)
          return {
            status: 404 as const,
            body: { message: 'Team era not found' },
          };
        return { status: 200 as const, body: teamEra };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.teamErasService.create(body),
      }),
    });
  }
}
