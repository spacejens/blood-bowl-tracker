import { Module } from '@nestjs/common';

import { BblPageService } from './bbl-page.service';
import { BblSourceReader } from './bbl-source-reader';
import { ExternalSystemNameConfigService } from './external-system-name-config.service';
import { NormalizeExtractedTextService } from './normalize-extracted-text.service';
import { SourceConfigService } from './source-config.service';

@Module({
  providers: [
    SourceConfigService,
    BblSourceReader,
    ExternalSystemNameConfigService,
    BblPageService,
    NormalizeExtractedTextService,
  ],
  exports: [
    BblSourceReader,
    ExternalSystemNameConfigService,
    BblPageService,
    NormalizeExtractedTextService,
  ],
})
export class SourceModule {}
