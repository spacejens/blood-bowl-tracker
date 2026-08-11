import { Module } from '@nestjs/common';

import { SppAwardValuesService } from './spp-award-values.service';
import { SppTotalsService } from './spp-totals.service';

@Module({
  providers: [SppAwardValuesService, SppTotalsService],
  exports: [SppAwardValuesService, SppTotalsService],
})
export class SppModule {}
