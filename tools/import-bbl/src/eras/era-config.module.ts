import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { EraConfigService } from './era-config.service';

@Module({
  imports: [ConfigModule],
  providers: [EraConfigService],
  exports: [EraConfigService],
})
export class EraConfigModule {}
