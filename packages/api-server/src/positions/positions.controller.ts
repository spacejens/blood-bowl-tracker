import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { PositionsService } from './positions.service';

@Controller()
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @TsRestHandler(contract.positions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/require-await
  async handler(): Promise<any> {
    return tsRestHandler(contract.positions, {
      list: async () => ({
        status: 200 as const,
        body: await this.positionsService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const position = await this.positionsService.findById(id);
        if (!position)
          return {
            status: 404 as const,
            body: { message: 'Position not found' },
          };
        return { status: 200 as const, body: position };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.positionsService.create(body),
      }),
    });
  }
}
