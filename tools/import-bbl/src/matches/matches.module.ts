import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import { BblMatchesImportService } from './bbl-matches-import.service';
import { MatchListPageParser } from './match-list-page-parser';

@Module({
  imports: [SourceModule, ImportModule],
  providers: [
    MatchListPageParser,
    BblMatchListReaderService,
    BblMatchesImportService,
  ],
  exports: [
    MatchListPageParser,
    BblMatchListReaderService,
    BblMatchesImportService,
  ],
})
export class MatchesModule {}
