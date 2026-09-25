import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpOfficialTeamsFilesImportService } from './tp-official-teams-files-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpOfficialTeamsFilesImportService],
  exports: [TpOfficialTeamsFilesImportService],
})
export class OfficialTeamsModule {}
