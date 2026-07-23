import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { BblPageService } from './bbl-page.service';
import { BblSourceReader } from './bbl-source-reader';
import { ExternalSystemNameConfigService } from './external-system-name-config.service';
import { NormalizeExtractedTextService } from './normalize-extracted-text.service';
import { PageParseErrorService } from './page-parse-error.service';
import { SourceConfigService } from './source-config.service';

@Module({
  imports: [ImportModule],
  providers: [
    SourceConfigService,
    BblSourceReader,
    ExternalSystemNameConfigService,
    BblPageService,
    NormalizeExtractedTextService,
    PageParseErrorService,
  ],
  exports: [
    BblSourceReader,
    ExternalSystemNameConfigService,
    BblPageService,
    NormalizeExtractedTextService,
    PageParseErrorService,
  ],
})
export class SourceModule {}
