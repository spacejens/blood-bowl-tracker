import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { MatchOutcomeCountsModule } from '../shared/match-outcome-counts.module';
import { RacesQueriesService } from './races-queries.service';

@Module({
  imports: [LikePatternModule, MatchOutcomeCountsModule],
  providers: [RacesQueriesService],
  exports: [RacesQueriesService],
})
export class RacesQueriesModule {}
