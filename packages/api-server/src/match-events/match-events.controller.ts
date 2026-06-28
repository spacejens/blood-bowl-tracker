import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { MatchEventsService } from './match-events.service';

@Controller()
export class MatchEventsController {
  constructor(private readonly matchEventsService: MatchEventsService) {}

  @TsRestHandler(contract.matchEvents)
  async handler() {
    return tsRestHandler(contract.matchEvents, {
      listByMatch: async ({ params: { matchId } }) => ({
        status: 200 as const,
        body: await this.matchEventsService.findByMatchId(matchId),
      }),
      create: async ({ body }) => ({
        status: 201 as const,
        body: await this.matchEventsService.create(body),
      }),
    });
  }
}
