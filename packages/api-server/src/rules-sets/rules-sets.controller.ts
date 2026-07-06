import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@blood-bowl-tracker/api-contract';
import { RulesSetsService } from './rules-sets.service';

@Controller()
export class RulesSetsController {
  constructor(private readonly rulesSetsService: RulesSetsService) {}

  @Implement(contract.rulesSets)
  handler() {
    return {
      list: implement(contract.rulesSets.list).handler(() =>
        this.rulesSetsService.findAll(),
      ),
      getById: implement(contract.rulesSets.getById).handler(
        async ({ input, errors }) => {
          const rulesSet = await this.rulesSetsService.findById(input.id);
          if (!rulesSet)
            throw errors.NOT_FOUND({ message: 'Rules set not found' });
          return rulesSet;
        },
      ),
      create: implement(contract.rulesSets.create).handler(({ input }) =>
        this.rulesSetsService.create(input),
      ),
    };
  }
}
