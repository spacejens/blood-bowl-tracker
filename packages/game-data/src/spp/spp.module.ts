import { Module } from '@nestjs/common';

import { SppAdjustmentsService } from './spp-adjustments.service';
import { SppAwardValuesService } from './spp-award-values.service';
import { SppForcedRateService } from './spp-forced-rate.service';
import { SppTotalsService } from './spp-totals.service';

@Module({
  providers: [
    SppAdjustmentsService,
    SppAwardValuesService,
    SppForcedRateService,
    SppTotalsService,
  ],
  exports: [
    SppAdjustmentsService,
    SppAwardValuesService,
    SppForcedRateService,
    SppTotalsService,
  ],
})
export class SppModule {}
