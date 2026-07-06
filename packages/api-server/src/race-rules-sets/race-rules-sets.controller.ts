import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { RaceRulesSetsService } from './race-rules-sets.service';

@Controller()
export class RaceRulesSetsController {
  constructor(private readonly raceRulesSetsService: RaceRulesSetsService) {}

  @Implement(contract.raceRulesSets)
  handler() {
    return {
      list: implement(contract.raceRulesSets.list).handler(() =>
        this.raceRulesSetsService.findAll(),
      ),
      create: implement(contract.raceRulesSets.create).handler(({ input }) =>
        this.raceRulesSetsService.create(input),
      ),
    };
  }
}
