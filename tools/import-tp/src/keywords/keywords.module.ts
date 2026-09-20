import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpKeywordCatalogService } from './tp-keyword-catalog.service';
import { TpPositionKeywordsImportService } from './tp-position-keywords-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpKeywordCatalogService, TpPositionKeywordsImportService],
  exports: [TpKeywordCatalogService, TpPositionKeywordsImportService],
})
export class KeywordsModule {}
