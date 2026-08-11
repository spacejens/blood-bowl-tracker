import { Module } from '@nestjs/common';

import { SppAwardValuesService } from './spp-award-values.service';

@Module({
  providers: [SppAwardValuesService],
  exports: [SppAwardValuesService],
})
export class SppModule {}
