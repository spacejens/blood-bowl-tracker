import { Module } from '@nestjs/common';

import { MatchesQueriesService } from './matches-queries.service';

@Module({
  providers: [MatchesQueriesService],
  exports: [MatchesQueriesService],
})
export class MatchesQueriesModule {}
