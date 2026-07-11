import { Module } from '@nestjs/common';

import { MatchListPageParser } from './match-list-page-parser';

@Module({
  providers: [MatchListPageParser],
  exports: [MatchListPageParser],
})
export class MatchesModule {}
