import { Module } from '@nestjs/common';

import { EraConfigService } from './era-config.service';

@Module({
  providers: [EraConfigService],
  exports: [EraConfigService],
})
export class EraConfigModule {}
