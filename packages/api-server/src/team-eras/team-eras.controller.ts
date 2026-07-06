import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { TeamErasService } from './team-eras.service';

@Controller()
export class TeamErasController {
  constructor(private readonly teamErasService: TeamErasService) {}

  @Implement(contract.teamEras)
  handler() {
    return {
      list: implement(contract.teamEras.list).handler(() =>
        this.teamErasService.findAll(),
      ),
      getById: implement(contract.teamEras.getById).handler(
        async ({ input, errors }) => {
          const teamEra = await this.teamErasService.findById(input.id);
          if (!teamEra)
            throw errors.NOT_FOUND({ message: 'Team era not found' });
          return teamEra;
        },
      ),
      create: implement(contract.teamEras.create).handler(({ input }) =>
        this.teamErasService.create(input),
      ),
    };
  }
}
