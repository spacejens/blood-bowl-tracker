import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { BblSourceReader } from './bbl-source-reader';
import { SourceConfigService } from './source-config.service';

@Module({
  imports: [ConfigModule],
  providers: [SourceConfigService, BblSourceReader],
  exports: [BblSourceReader],
})
export class SourceModule {}
