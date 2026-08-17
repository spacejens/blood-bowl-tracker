import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { SourceModule } from '../source/source.module';
import { TpCompetitionsImportService } from './tp-competitions-import.service';

@Module({
  imports: [ImportModule, SourceModule, ParseTpModule, EraDataConfigModule],
  providers: [TpCompetitionsImportService],
  exports: [TpCompetitionsImportService],
})
export class CompetitionsModule {}
