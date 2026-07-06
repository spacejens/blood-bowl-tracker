import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { RacesService } from './races.service';

@Controller()
export class RacesController {
  constructor(private readonly racesService: RacesService) {}

  @Implement(contract.races)
  handler() {
    return {
      list: implement(contract.races.list).handler(() =>
        this.racesService.findAll(),
      ),
      getById: implement(contract.races.getById).handler(
        async ({ input, errors }) => {
          const race = await this.racesService.findById(input.id);
          if (!race) throw errors.NOT_FOUND({ message: 'Race not found' });
          return race;
        },
      ),
      create: implement(contract.races.create).handler(({ input }) =>
        this.racesService.create(input),
      ),
    };
  }
}
