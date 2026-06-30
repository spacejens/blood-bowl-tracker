import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { LeaguesService } from './leagues.service';

@Controller()
export class LeaguesController {
  constructor(private readonly leaguesService: LeaguesService) {}

  @TsRestHandler(contract.leagues)
  async handler(): Promise<any> {
    return tsRestHandler(contract.leagues, {
      list: async () => ({
        status: 200 as const,
        body: await this.leaguesService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const league = await this.leaguesService.findById(id);
        if (!league) return { status: 404 as const, body: { message: 'League not found' } };
        return { status: 200 as const, body: league };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.leaguesService.create(body),
      }),
    });
  }
}
