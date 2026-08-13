import { Module } from '@nestjs/common';

import { SppAdjustmentsService } from './spp-adjustments.service';
import { SppAwardValuesService } from './spp-award-values.service';
import { SppEventCountsService } from './spp-event-counts.service';
import { SppForcedRateService } from './spp-forced-rate.service';
import { SppTotalsService } from './spp-totals.service';

@Module({
  providers: [
    SppAdjustmentsService,
    SppAwardValuesService,
    SppEventCountsService,
    SppForcedRateService,
    SppTotalsService,
  ],
  exports: [
    SppAdjustmentsService,
    SppAwardValuesService,
    SppEventCountsService,
    SppForcedRateService,
    SppTotalsService,
  ],
})
export class SppModule {}
