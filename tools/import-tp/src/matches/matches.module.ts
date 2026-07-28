import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpMatchCategoryService } from './tp-match-category.service';
import { TpMatchesImportService } from './tp-matches-import.service';

@Module({
  // SourceModule supplies ExternalSystemNameConfigService; ImportModule supplies
  // MatchesImportService + ExternalSystemBootstrapService. No ParseTpModule —
  // this service consumes the already-parsed matchesByCompetitionId map, doing
  // no file I/O or parsing of its own. TpMatchCategoryService has no
  // dependencies of its own -- it's a pure classifier over already-parsed
  // TpMatch data.
  imports: [ImportModule, SourceModule],
  providers: [TpMatchesImportService, TpMatchCategoryService],
  exports: [TpMatchesImportService],
})
export class MatchesModule {}
