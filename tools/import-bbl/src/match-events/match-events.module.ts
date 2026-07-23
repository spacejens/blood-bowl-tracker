import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { MatchesModule } from '../matches/matches.module';
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
  ],
  exports: [BblMatchEventsImportService],
})
export class MatchEventsModule {}
