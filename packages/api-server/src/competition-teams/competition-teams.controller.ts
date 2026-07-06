import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { CompetitionTeamsService } from './competition-teams.service';

@Controller()
export class CompetitionTeamsController {
  constructor(
    private readonly competitionTeamsService: CompetitionTeamsService,
  ) {}

  @Implement(contract.competitionTeams)
  handler() {
    return {
      list: implement(contract.competitionTeams.list).handler(() =>
        this.competitionTeamsService.findAll(),
      ),
      create: implement(contract.competitionTeams.create).handler(({ input }) =>
        this.competitionTeamsService.create(input),
      ),
    };
  }
}
