import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpMatchEventsImportService } from './tp-match-events-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpMatchEventsImportService],
  exports: [TpMatchEventsImportService],
})
export class MatchEventsModule {}
