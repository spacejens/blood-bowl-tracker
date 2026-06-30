import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { CompetitionsService } from './competitions.service';

@Controller()
export class CompetitionsController {
  constructor(private readonly competitionsService: CompetitionsService) {}

  @TsRestHandler(contract.competitions)
  async handler(): Promise<any> {
    return tsRestHandler(contract.competitions, {
      list: async () => ({
        status: 200 as const,
        body: await this.competitionsService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const competition = await this.competitionsService.findById(id);
        if (!competition)
          return { status: 404 as const, body: { message: 'Competition not found' } };
        return { status: 200 as const, body: competition };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.competitionsService.create(body),
      }),
    });
  }
}
