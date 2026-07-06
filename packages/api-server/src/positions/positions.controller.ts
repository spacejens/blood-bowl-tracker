import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { PositionsService } from './positions.service';

@Controller()
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Implement(contract.positions)
  handler() {
    return {
      list: implement(contract.positions.list).handler(() =>
        this.positionsService.findAll(),
      ),
      getById: implement(contract.positions.getById).handler(
        async ({ input, errors }) => {
          const position = await this.positionsService.findById(input.id);
          if (!position)
            throw errors.NOT_FOUND({ message: 'Position not found' });
          return position;
        },
      ),
      create: implement(contract.positions.create).handler(({ input }) =>
        this.positionsService.create(input),
      ),
    };
  }
}
