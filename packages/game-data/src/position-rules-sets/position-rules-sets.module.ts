import { Module } from '@nestjs/common';

import { PositionRulesSetsService } from './position-rules-sets.service';

@Module({
  providers: [PositionRulesSetsService],
  exports: [PositionRulesSetsService],
})
export class PositionRulesSetsModule {}
