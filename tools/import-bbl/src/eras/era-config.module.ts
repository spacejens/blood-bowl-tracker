import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraConfigService } from './era-config.service';

@Module({
  providers: [EraConfigService, ConfigErrorMessageService],
  exports: [EraConfigService],
})
export class EraConfigModule {}
