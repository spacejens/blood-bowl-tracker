import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { RulesSetsService } from './rules-sets.service';

@Controller()
export class RulesSetsController {
  constructor(private readonly rulesSetsService: RulesSetsService) {}

  @TsRestHandler(contract.rulesSets)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/require-await
  async handler(): Promise<any> {
    return tsRestHandler(contract.rulesSets, {
      list: async () => ({
        status: 200 as const,
        body: await this.rulesSetsService.findAll(),
      }),
      getById: async ({ params: { id } }) => {
        const rulesSet = await this.rulesSetsService.findById(id);
        if (!rulesSet)
          return {
            status: 404 as const,
            body: { message: 'Rules set not found' },
          };
        return { status: 200 as const, body: rulesSet };
      },
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.rulesSetsService.create(body),
      }),
    });
  }
}
