import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { BblCoachesImportService } from './bbl-coaches-import.service';
import { CoachPageParser } from './coach-page-parser';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [CoachPageParser, BblCoachesImportService],
  exports: [BblCoachesImportService],
})
export class CoachesModule {}
