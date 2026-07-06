import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { ExternalSystemsService } from './external-systems.service';

@Controller()
export class ExternalSystemsController {
  constructor(
    private readonly externalSystemsService: ExternalSystemsService,
  ) {}

  @Implement(contract.externalSystems)
  handler() {
    return {
      list: implement(contract.externalSystems.list).handler(() =>
        this.externalSystemsService.findAll(),
      ),
      getById: implement(contract.externalSystems.getById).handler(
        async ({ input, errors }) => {
          const system = await this.externalSystemsService.findById(input.id);
          if (!system)
            throw errors.NOT_FOUND({ message: 'External system not found' });
          return system;
        },
      ),
      create: implement(contract.externalSystems.create).handler(({ input }) =>
        this.externalSystemsService.create(input),
      ),
      upsert: implement(contract.externalSystems.upsert).handler(
        async ({ input }) => {
          const { system, created } =
            await this.externalSystemsService.upsert(input);
          return { ...system, created };
        },
      ),
    };
  }
}
