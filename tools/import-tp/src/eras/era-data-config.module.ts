import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraDataConfigService } from './era-data-config.service';

@Module({
  providers: [EraDataConfigService, ConfigErrorMessageService],
  exports: [EraDataConfigService],
})
export class EraDataConfigModule {}
