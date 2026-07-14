import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { BblMatchDetailReaderService } from './bbl-match-detail-reader.service';
import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import { BblMatchesImportService } from './bbl-matches-import.service';
import { MatchEventsPageParser } from './match-events-page-parser';
import { MatchListPageParser } from './match-list-page-parser';
import { MatchMergeConfigService } from './match-merge-config.service';
import { MatchTeamsPageParser } from './match-teams-page-parser';

@Module({
  imports: [SourceModule, ImportModule],
  providers: [
    MatchListPageParser,
    MatchTeamsPageParser,
    MatchEventsPageParser,
    BblMatchDetailReaderService,
    BblMatchListReaderService,
    BblMatchesImportService,
    MatchMergeConfigService,
  ],
  exports: [
    MatchListPageParser,
    MatchTeamsPageParser,
    MatchEventsPageParser,
    BblMatchDetailReaderService,
    BblMatchListReaderService,
    BblMatchesImportService,
    MatchMergeConfigService,
  ],
})
export class MatchesModule {}
