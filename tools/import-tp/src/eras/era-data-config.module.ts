import { Module } from '@nestjs/common';

import { EraDataConfigService } from './era-data-config.service';

@Module({
  providers: [EraDataConfigService],
  exports: [EraDataConfigService],
})
export class EraDataConfigModule {}
