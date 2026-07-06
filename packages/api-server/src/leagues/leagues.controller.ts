import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { LeaguesService } from './leagues.service';

@Controller()
export class LeaguesController {
  constructor(private readonly leaguesService: LeaguesService) {}

  @Implement(contract.leagues)
  handler() {
    return {
      list: implement(contract.leagues.list).handler(() =>
        this.leaguesService.findAll(),
      ),
      getById: implement(contract.leagues.getById).handler(
        async ({ input, errors }) => {
          const league = await this.leaguesService.findById(input.id);
          if (!league) throw errors.NOT_FOUND({ message: 'League not found' });
          return league;
        },
      ),
      create: implement(contract.leagues.create).handler(({ input }) =>
        this.leaguesService.create(input),
      ),
    };
  }
}
