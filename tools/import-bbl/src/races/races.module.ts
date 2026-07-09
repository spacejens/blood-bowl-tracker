import { Module } from '@nestjs/common';
import { ImportModule } from '@blood-bowl-tracker/import';
import { SourceModule } from '../source/source.module';
import { RacePageParser } from './race-page-parser';
import { BblRacesImportService } from './bbl-races-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [RacePageParser, BblRacesImportService],
  exports: [BblRacesImportService],
})
export class RacesModule {}
