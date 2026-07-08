import { Module } from '@nestjs/common';
import { ImportModule } from '@blood-bowl-tracker/import';
import { SourceModule } from '../source/source.module';
import { CoachPageParser } from './coach-page-parser';
import { BblCoachesImportService } from './bbl-coaches-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [CoachPageParser, BblCoachesImportService],
  exports: [BblCoachesImportService],
})
export class CoachesModule {}
