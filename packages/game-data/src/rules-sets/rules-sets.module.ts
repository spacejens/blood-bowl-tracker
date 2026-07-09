import { Module } from '@nestjs/common';

import { RulesSetsService } from './rules-sets.service';

@Module({
  providers: [RulesSetsService],
  exports: [RulesSetsService],
})
export class RulesSetsModule {}
