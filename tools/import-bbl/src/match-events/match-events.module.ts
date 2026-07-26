import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { MatchesModule } from '../matches/matches.module';
import { UpsertFieldNarrowingService } from '../shared/upsert-field-narrowing.service';
import { SourceModule } from '../source/source.module';
import { BblMatchEventsImportService } from './bbl-match-events-import.service';
import { BblMatchEventsReaderService } from './bbl-match-events-reader.service';
import { MatchEventCorrelationService } from './match-event-correlation.service';

@Module({
  imports: [SourceModule, ImportModule, MatchesModule],
  providers: [
    BblMatchEventsReaderService,
    BblMatchEventsImportService,
    MatchEventCorrelationService,
    UpsertFieldNarrowingService,
  ],
  exports: [BblMatchEventsImportService],
})
export class MatchEventsModule {}
