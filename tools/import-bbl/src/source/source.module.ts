import { Module } from '@nestjs/common';

import { BblSourceReader } from './bbl-source-reader';
import { ExternalSystemNameConfigService } from './external-system-name-config.service';
import { SourceConfigService } from './source-config.service';

@Module({
  providers: [
    SourceConfigService,
    BblSourceReader,
    ExternalSystemNameConfigService,
  ],
  exports: [BblSourceReader, ExternalSystemNameConfigService],
})
export class SourceModule {}
