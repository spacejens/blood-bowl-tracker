import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { MatchEventsService } from './match-events.service';

@Controller()
export class MatchEventsController {
  constructor(private readonly matchEventsService: MatchEventsService) {}

  @Implement(contract.matchEvents)
  handler() {
    return {
      listByMatch: implement(contract.matchEvents.listByMatch).handler(
        ({ input }) => this.matchEventsService.findByMatchId(input.matchId),
      ),
      create: implement(contract.matchEvents.create).handler(({ input }) =>
        this.matchEventsService.create(input),
      ),
    };
  }
}
