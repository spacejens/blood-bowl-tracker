import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { MatchEventCountsModule } from '../shared/match-event-counts.module';
import { MatchOutcomeCountsModule } from '../shared/match-outcome-counts.module';
import { TrophyAwardCountsModule } from '../shared/trophy-award-counts.module';
import { CoachesQueriesService } from './coaches-queries.service';

@Module({
  imports: [
    LikePatternModule,
    MatchEventCountsModule,
    MatchOutcomeCountsModule,
    TrophyAwardCountsModule,
  ],
  providers: [CoachesQueriesService],
  exports: [CoachesQueriesService],
})
export class CoachesQueriesModule {}
