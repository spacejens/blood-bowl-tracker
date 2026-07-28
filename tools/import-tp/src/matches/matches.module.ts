import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpMatchCategoryService } from './tp-match-category.service';
import { TpMatchOutcomesImportService } from './tp-match-outcomes-import.service';
import { TpMatchesImportService } from './tp-matches-import.service';

@Module({
  // SourceModule supplies ExternalSystemNameConfigService; ImportModule supplies
  // MatchesImportService + ExternalSystemBootstrapService +
  // MatchOutcomesImportService (consumed by TpMatchOutcomesImportService). No
  // ParseTpModule — these services consume the already-parsed
  // matchesByCompetitionId map, doing no file I/O or parsing of their own.
  // TpMatchCategoryService has no dependencies of its own -- it's a pure
  // classifier over already-parsed TpMatch data.
  imports: [ImportModule, SourceModule],
  providers: [
    TpMatchesImportService,
    TpMatchCategoryService,
    TpMatchOutcomesImportService,
  ],
  exports: [TpMatchesImportService, TpMatchOutcomesImportService],
})
export class MatchesModule {}
