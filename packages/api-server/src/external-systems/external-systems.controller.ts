import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { ExternalSystemsService } from './external-systems.service';

@Controller()
export class ExternalSystemsController {
  constructor(
    private readonly externalSystemsService: ExternalSystemsService,
  ) {}

  @TsRestHandler(contract.externalSystems)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/require-await
  async handler(): Promise<any> {
    return tsRestHandler(contract.externalSystems, {
      list: async () => ({
        status: 200 as const,
        body: await this.externalSystemsService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const system = await this.externalSystemsService.findById(id);
        if (!system)
          return {
            status: 404 as const,
            body: { message: 'External system not found' },
          };
        return { status: 200 as const, body: system };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.externalSystemsService.create(body),
      }),
      upsert: async ({ body }) => {
        const { system, created } =
          await this.externalSystemsService.upsert(body);
        return created
          ? { status: 201 as const, body: system }
          : { status: 200 as const, body: system };
      },
    });
  }
}
