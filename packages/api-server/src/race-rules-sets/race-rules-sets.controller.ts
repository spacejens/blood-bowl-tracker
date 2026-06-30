import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { RaceRulesSetsService } from './race-rules-sets.service';

@Controller()
export class RaceRulesSetsController {
  constructor(private readonly raceRulesSetsService: RaceRulesSetsService) {}

  @TsRestHandler(contract.raceRulesSets)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/require-await
  async handler(): Promise<any> {
    return tsRestHandler(contract.raceRulesSets, {
      list: async () => ({
        status: 200 as const,
        body: await this.raceRulesSetsService.findAll(),
      }),
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.raceRulesSetsService.create(body),
      }),
    });
  }
}
