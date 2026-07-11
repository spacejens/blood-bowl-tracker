import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraConfigModule } from '../eras/era-config.module';
import { MatchesModule } from '../matches/matches.module';
import { SourceModule } from '../source/source.module';
import { BblCompetitionsImportService } from './bbl-competitions-import.service';
import { CompetitionListPageParser } from './competition-list-page-parser';

@Module({
  imports: [ImportModule, SourceModule, EraConfigModule, MatchesModule],
  providers: [CompetitionListPageParser, BblCompetitionsImportService],
  exports: [BblCompetitionsImportService],
})
export class CompetitionsModule {}
