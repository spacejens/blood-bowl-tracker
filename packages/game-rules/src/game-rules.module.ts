import { Module } from '@nestjs/common';

import { AdvancementKindCandidatesService } from './advancements/advancement-kind-candidates.service';
import { AdvancementSpendRangeService } from './advancements/advancement-spend-range.service';
import { LastingReductionService } from './lasting-reductions/lasting-reduction.service';

@Module({
  providers: [
    AdvancementKindCandidatesService,
    AdvancementSpendRangeService,
    LastingReductionService,
  ],
  exports: [
    AdvancementKindCandidatesService,
    AdvancementSpendRangeService,
    LastingReductionService,
  ],
})
export class GameRulesModule {}
