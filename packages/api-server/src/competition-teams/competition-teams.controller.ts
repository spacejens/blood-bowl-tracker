import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { CompetitionTeamsService } from './competition-teams.service';

@Controller()
export class CompetitionTeamsController {
  constructor(private readonly competitionTeamsService: CompetitionTeamsService) {}

  @TsRestHandler(contract.competitionTeams)
  async handler(): Promise<any> {
    return tsRestHandler(contract.competitionTeams, {
      list: async () => ({
        status: 200 as const,
        body: await this.competitionTeamsService.findAll(),
      }),
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.competitionTeamsService.create(body),
      }),
    });
  }
}
