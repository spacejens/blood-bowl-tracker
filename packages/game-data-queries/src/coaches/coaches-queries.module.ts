import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { MatchEventCountsModule } from '../shared/match-event-counts.module';
import { MatchOutcomeCountsModule } from '../shared/match-outcome-counts.module';
import { PerMatchAverageSqlModule } from '../shared/per-match-average-sql.module';
import { TrophyAwardCountsModule } from '../shared/trophy-award-counts.module';
import { CoachAverageStatisticsService } from './coach-average-statistics.service';
import { CoachMatchGapsService } from './coach-match-gaps.service';
import { CoachParticipationCountsService } from './coach-participation-counts.service';
import { CoachesQueriesService } from './coaches-queries.service';

@Module({
  imports: [
    LikePatternModule,
    MatchEventCountsModule,
    MatchOutcomeCountsModule,
    PerMatchAverageSqlModule,
    TrophyAwardCountsModule,
  ],
  providers: [
    CoachAverageStatisticsService,
    CoachesQueriesService,
    CoachMatchGapsService,
    CoachParticipationCountsService,
  ],
  exports: [CoachesQueriesService, CoachAverageStatisticsService],
})
export class CoachesQueriesModule {}
