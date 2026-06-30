import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { ErasService } from './eras.service';

@Controller()
export class ErasController {
  constructor(private readonly erasService: ErasService) {}

  @TsRestHandler(contract.eras)
  async handler(): Promise<any> {
    return tsRestHandler(contract.eras, {
      list: async () => ({
        status: 200 as const,
        body: await this.erasService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const era = await this.erasService.findById(id);
        if (!era) return { status: 404 as const, body: { message: 'Era not found' } };
        return { status: 200 as const, body: era };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.erasService.create(body),
      }),
    });
  }
}
