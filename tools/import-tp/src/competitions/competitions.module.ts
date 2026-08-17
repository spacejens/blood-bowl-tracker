import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { SourceModule } from '../source/source.module';
import { TpCompetitionIdResolverService } from './tp-competition-id-resolver.service';
import { TpCompetitionsImportService } from './tp-competitions-import.service';

@Module({
  imports: [ImportModule, SourceModule, ParseTpModule, EraDataConfigModule],
  providers: [TpCompetitionsImportService, TpCompetitionIdResolverService],
  exports: [TpCompetitionsImportService, TpCompetitionIdResolverService],
})
export class CompetitionsModule {}
