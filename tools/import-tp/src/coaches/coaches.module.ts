import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpCoachesImportService } from './tp-coaches-import.service';

@Module({
  imports: [ImportModule, SourceModule, ParseTpModule],
  providers: [TpCoachesImportService],
  exports: [TpCoachesImportService],
})
export class CoachesModule {}
