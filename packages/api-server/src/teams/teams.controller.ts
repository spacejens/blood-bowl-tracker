import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { TeamsService } from './teams.service';

@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Implement(contract.teams)
  handler() {
    return {
      list: implement(contract.teams.list).handler(() =>
        this.teamsService.findAll(),
      ),
      getById: implement(contract.teams.getById).handler(
        async ({ input, errors }) => {
          const team = await this.teamsService.findById(input.id);
          if (!team) throw errors.NOT_FOUND({ message: 'Team not found' });
          return team;
        },
      ),
      create: implement(contract.teams.create).handler(({ input }) =>
        this.teamsService.create(input),
      ),
    };
  }
}
