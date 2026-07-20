import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpMatchesImportService } from './tp-matches-import.service';

@Module({
  // SourceModule supplies ExternalSystemNameConfigService; ImportModule supplies
  // MatchesImportService + ExternalSystemBootstrapService. No ParseTpModule —
  // this service consumes the already-parsed matchesByCompetitionId map, doing
  // no file I/O or parsing of its own.
  imports: [ImportModule, SourceModule],
  providers: [TpMatchesImportService],
  exports: [TpMatchesImportService],
})
export class MatchesModule {}
