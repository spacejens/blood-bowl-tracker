import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpOfficialTeamsImportService } from './tp-official-teams-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpOfficialTeamsImportService],
  exports: [TpOfficialTeamsImportService],
})
export class OfficialTeamsModule {}
