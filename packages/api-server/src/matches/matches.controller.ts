import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { MatchesService } from './matches.service';

@Controller()
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Implement(contract.matches)
  handler() {
    return {
      list: implement(contract.matches.list).handler(() =>
        this.matchesService.findAll(),
      ),
      getById: implement(contract.matches.getById).handler(
        async ({ input, errors }) => {
          const match = await this.matchesService.findById(input.id);
          if (!match) throw errors.NOT_FOUND({ message: 'Match not found' });
          return match;
        },
      ),
      create: implement(contract.matches.create).handler(({ input }) =>
        this.matchesService.create(input),
      ),
    };
  }
}
