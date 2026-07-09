import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { BblRacesImportService } from './bbl-races-import.service';
import { RacePageParser } from './race-page-parser';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [RacePageParser, BblRacesImportService],
  exports: [BblRacesImportService],
})
export class RacesModule {}
