import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpTeamsImportService } from './tp-teams-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpTeamsImportService],
  exports: [TpTeamsImportService],
})
export class TeamsModule {}
