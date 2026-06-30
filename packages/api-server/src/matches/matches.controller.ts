import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { MatchesService } from './matches.service';

@Controller()
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @TsRestHandler(contract.matches)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/require-await
  async handler(): Promise<any> {
    return tsRestHandler(contract.matches, {
      list: async () => ({
        status: 200 as const,
        body: await this.matchesService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const match = await this.matchesService.findById(id);
        if (!match)
          return { status: 404 as const, body: { message: 'Match not found' } };
        return { status: 200 as const, body: match };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.matchesService.create(body),
      }),
    });
  }
}
