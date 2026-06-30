import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { TeamsService } from './teams.service';

@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @TsRestHandler(contract.teams)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/require-await
  async handler(): Promise<any> {
    return tsRestHandler(contract.teams, {
      list: async () => ({
        status: 200 as const,
        body: await this.teamsService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const team = await this.teamsService.findById(id);
        if (!team)
          return { status: 404 as const, body: { message: 'Team not found' } };
        return { status: 200 as const, body: team };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.teamsService.create(body),
      }),
    });
  }
}
