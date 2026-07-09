import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { BblSourceReader } from './bbl-source-reader';
import { ExternalSystemNameConfigService } from './external-system-name-config.service';
import { SourceConfigService } from './source-config.service';

@Module({
  imports: [ConfigModule],
  providers: [
    SourceConfigService,
    BblSourceReader,
    ExternalSystemNameConfigService,
  ],
  exports: [BblSourceReader, ExternalSystemNameConfigService],
})
export class SourceModule {}
