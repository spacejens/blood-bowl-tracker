import { Module } from '@nestjs/common';

import { MatchScopeFilterModule } from '../shared/match-scope-filter.module';
import { AdvancementCostsService } from './advancement-costs.service';
import { AdvancementKindCandidatesService } from './advancement-kind-candidates.service';
import { AdvancementPricingModelService } from './advancement-pricing-model.service';
import { AdvancementSpendRangeService } from './advancement-spend-range.service';
import { SppAdjustmentsService } from './spp-adjustments.service';
import { SppAwardValuesService } from './spp-award-values.service';
import { SppEventCountsService } from './spp-event-counts.service';
import { SppForcedRateService } from './spp-forced-rate.service';
import { SppOngoingEstimateService } from './spp-ongoing-estimate.service';
import { SppTotalsService } from './spp-totals.service';
import { StoredUnspentSppSettlementService } from './stored-unspent-spp-settlement.service';
import { UnspentSppService } from './unspent-spp.service';
import { UnspentSppDecisionService } from './unspent-spp-decision.service';

@Module({
  imports: [MatchScopeFilterModule],
  providers: [
    AdvancementCostsService,
    AdvancementKindCandidatesService,
    AdvancementPricingModelService,
    AdvancementSpendRangeService,
    SppAdjustmentsService,
    SppAwardValuesService,
    SppEventCountsService,
    SppForcedRateService,
    SppOngoingEstimateService,
    SppTotalsService,
    StoredUnspentSppSettlementService,
    UnspentSppDecisionService,
    UnspentSppService,
  ],
  exports: [
    AdvancementCostsService,
    AdvancementKindCandidatesService,
    AdvancementPricingModelService,
    AdvancementSpendRangeService,
    SppAdjustmentsService,
    SppAwardValuesService,
    SppEventCountsService,
    SppForcedRateService,
    SppOngoingEstimateService,
    SppTotalsService,
    StoredUnspentSppSettlementService,
    UnspentSppDecisionService,
    UnspentSppService,
  ],
})
export class SppModule {}
