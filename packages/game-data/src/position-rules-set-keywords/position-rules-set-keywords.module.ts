import { Module } from '@nestjs/common';

import { PositionRulesSetKeywordsService } from './position-rules-set-keywords.service';

@Module({
  providers: [PositionRulesSetKeywordsService],
  exports: [PositionRulesSetKeywordsService],
})
export class PositionRulesSetKeywordsModule {}
