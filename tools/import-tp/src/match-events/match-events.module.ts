import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpMatchEventBuildersService } from './tp-match-event-builders.service';
import { TpMatchEventsBuilderService } from './tp-match-events-builder.service';
import { TpMatchEventsCorrelationService } from './tp-match-events-correlation.service';
import { TpMatchEventsImportService } from './tp-match-events-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [
    TpMatchEventsImportService,
    TpMatchEventsBuilderService,
    TpMatchEventBuildersService,
    TpMatchEventsCorrelationService,
  ],
  exports: [
    TpMatchEventsImportService,
    TpMatchEventsBuilderService,
    TpMatchEventsCorrelationService,
  ],
})
export class MatchEventsModule {}
