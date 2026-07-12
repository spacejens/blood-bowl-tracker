import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import { MatchListPageParser } from './match-list-page-parser';

@Module({
  imports: [SourceModule],
  providers: [MatchListPageParser, BblMatchListReaderService],
  exports: [MatchListPageParser, BblMatchListReaderService],
})
export class MatchesModule {}
