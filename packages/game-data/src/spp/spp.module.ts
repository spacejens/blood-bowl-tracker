import { Module } from '@nestjs/common';

import { SppAwardValuesService } from './spp-award-values.service';
import { SppForcedRateService } from './spp-forced-rate.service';
import { SppTotalsService } from './spp-totals.service';

@Module({
  providers: [SppAwardValuesService, SppForcedRateService, SppTotalsService],
  exports: [SppAwardValuesService, SppForcedRateService, SppTotalsService],
})
export class SppModule {}
