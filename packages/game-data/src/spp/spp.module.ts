import { Module } from '@nestjs/common';

import { MatchScopeFilterModule } from '../shared/match-scope-filter.module';
import { AdvancementCostsService } from './advancement-costs.service';
import { AdvancementKindCandidatesService } from './advancement-kind-candidates.service';
import { AdvancementSpendRangeService } from './advancement-spend-range.service';
import { SppAdjustmentsService } from './spp-adjustments.service';
import { SppAwardValuesService } from './spp-award-values.service';
import { SppEventCountsService } from './spp-event-counts.service';
import { SppForcedRateService } from './spp-forced-rate.service';
import { SppOngoingEstimateService } from './spp-ongoing-estimate.service';
import { SppTotalsService } from './spp-totals.service';

@Module({
  imports: [MatchScopeFilterModule],
  providers: [
    AdvancementCostsService,
    AdvancementKindCandidatesService,
    AdvancementSpendRangeService,
    SppAdjustmentsService,
    SppAwardValuesService,
    SppEventCountsService,
    SppForcedRateService,
    SppOngoingEstimateService,
    SppTotalsService,
  ],
  exports: [
    AdvancementCostsService,
    AdvancementKindCandidatesService,
    AdvancementSpendRangeService,
    SppAdjustmentsService,
    SppAwardValuesService,
    SppEventCountsService,
    SppForcedRateService,
    SppOngoingEstimateService,
    SppTotalsService,
  ],
})
export class SppModule {}
