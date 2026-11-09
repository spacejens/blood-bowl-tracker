import { Module } from '@nestjs/common';

import { PlayersQueriesModule } from '../players/players-queries.module';
import { LikePatternModule } from '../shared/like-pattern.module';
import { MatchEventCountsModule } from '../shared/match-event-counts.module';
import { MatchOutcomeCountsModule } from '../shared/match-outcome-counts.module';
import { TrophyAwardCountsModule } from '../shared/trophy-award-counts.module';
import { TeamAverageStatisticsService } from './team-average-statistics.service';
import { TeamsQueriesService } from './teams-queries.service';
import { TeamsStatisticsService } from './teams-statistics.service';

@Module({
  imports: [
    LikePatternModule,
    MatchEventCountsModule,
    MatchOutcomeCountsModule,
    PlayersQueriesModule,
    TrophyAwardCountsModule,
  ],
  providers: [
    TeamsQueriesService,
    TeamsStatisticsService,
    TeamAverageStatisticsService,
  ],
  exports: [
    TeamsQueriesService,
    TeamsStatisticsService,
    TeamAverageStatisticsService,
  ],
})
export class TeamsQueriesModule {}
