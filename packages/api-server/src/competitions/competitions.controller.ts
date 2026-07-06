import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { CompetitionsService } from './competitions.service';

@Controller()
export class CompetitionsController {
  constructor(private readonly competitionsService: CompetitionsService) {}

  @Implement(contract.competitions)
  handler() {
    return {
      list: implement(contract.competitions.list).handler(() =>
        this.competitionsService.findAll(),
      ),
      getById: implement(contract.competitions.getById).handler(
        async ({ input, errors }) => {
          const competition = await this.competitionsService.findById(input.id);
          if (!competition)
            throw errors.NOT_FOUND({ message: 'Competition not found' });
          return competition;
        },
      ),
      create: implement(contract.competitions.create).handler(({ input }) =>
        this.competitionsService.create(input),
      ),
    };
  }
}
