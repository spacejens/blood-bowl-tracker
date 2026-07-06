import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { ErasService } from './eras.service';

@Controller()
export class ErasController {
  constructor(private readonly erasService: ErasService) {}

  @Implement(contract.eras)
  handler() {
    return {
      list: implement(contract.eras.list).handler(() =>
        this.erasService.findAll(),
      ),
      getById: implement(contract.eras.getById).handler(
        async ({ input, errors }) => {
          const era = await this.erasService.findById(input.id);
          if (!era) throw errors.NOT_FOUND({ message: 'Era not found' });
          return era;
        },
      ),
      create: implement(contract.eras.create).handler(({ input }) =>
        this.erasService.create(input),
      ),
    };
  }
}
