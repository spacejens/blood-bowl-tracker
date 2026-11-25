import { Module } from '@nestjs/common';

import { AdvancementKindCandidatesService } from './advancements/advancement-kind-candidates.service';
import { AdvancementSpendRangeService } from './advancements/advancement-spend-range.service';
import { ReportedAdvancementPricingService } from './advancements/reported-advancement-pricing.service';
import { LastingReductionService } from './lasting-reductions/lasting-reduction.service';

@Module({
  providers: [
    AdvancementKindCandidatesService,
    AdvancementSpendRangeService,
    LastingReductionService,
    ReportedAdvancementPricingService,
  ],
  exports: [
    AdvancementKindCandidatesService,
    AdvancementSpendRangeService,
    LastingReductionService,
    ReportedAdvancementPricingService,
  ],
})
export class GameRulesModule {}
