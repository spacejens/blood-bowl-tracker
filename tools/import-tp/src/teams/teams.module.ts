import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpTeamsImportService } from './tp-teams-import.service';

@Module({
  imports: [ImportModule, SourceModule, ParseTpModule],
  providers: [TpTeamsImportService],
  exports: [TpTeamsImportService],
})
export class TeamsModule {}
