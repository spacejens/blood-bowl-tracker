import { Module } from '@nestjs/common';

import { AdvancementKindCandidatesService } from './advancements/advancement-kind-candidates.service';
import { AdvancementSpendRangeService } from './advancements/advancement-spend-range.service';

@Module({
  providers: [AdvancementKindCandidatesService, AdvancementSpendRangeService],
  exports: [AdvancementKindCandidatesService, AdvancementSpendRangeService],
})
export class GameRulesModule {}
