import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { MatchTeamsService } from './match-teams.service';

@Controller()
export class MatchTeamsController {
  constructor(private readonly matchTeamsService: MatchTeamsService) {}

  @TsRestHandler(contract.matchTeams)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/require-await
  async handler(): Promise<any> {
    return tsRestHandler(contract.matchTeams, {
      list: async () => ({
        status: 200 as const,
        body: await this.matchTeamsService.findAll(),
      }),
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.matchTeamsService.create(body),
      }),
    });
  }
}
