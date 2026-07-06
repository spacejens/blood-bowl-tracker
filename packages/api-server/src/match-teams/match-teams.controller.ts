import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { MatchTeamsService } from './match-teams.service';

@Controller()
export class MatchTeamsController {
  constructor(private readonly matchTeamsService: MatchTeamsService) {}

  @Implement(contract.matchTeams)
  handler() {
    return {
      list: implement(contract.matchTeams.list).handler(() =>
        this.matchTeamsService.findAll(),
      ),
      create: implement(contract.matchTeams.create).handler(({ input }) =>
        this.matchTeamsService.create(input),
      ),
    };
  }
}
