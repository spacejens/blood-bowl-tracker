import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpRosterFilesImportService } from './tp-roster-files-import.service';
import { TpRosterPlayerFactsService } from './tp-roster-player-facts.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpRosterFilesImportService, TpRosterPlayerFactsService],
  exports: [TpRosterFilesImportService, TpRosterPlayerFactsService],
})
export class RostersModule {}
