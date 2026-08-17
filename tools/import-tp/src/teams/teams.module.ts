import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { SourceModule } from '../source/source.module';
import { TpTeamsImportService } from './tp-teams-import.service';

@Module({
  imports: [ImportModule, SourceModule, EraDataConfigModule],
  providers: [TpTeamsImportService],
  exports: [TpTeamsImportService],
})
export class TeamsModule {}
