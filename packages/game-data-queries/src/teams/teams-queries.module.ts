import { Module } from '@nestjs/common';

import { PlayersQueriesModule } from '../players/players-queries.module';
import { MatchEventCountsModule } from '../shared/match-event-counts.module';
import { MatchOutcomeCountsModule } from '../shared/match-outcome-counts.module';
import { TrophyAwardCountsModule } from '../shared/trophy-award-counts.module';
import { TeamAverageStatisticsService } from './team-average-statistics.service';
import { TeamsStatisticsService } from './teams-statistics.service';

@Module({
  imports: [
    MatchEventCountsModule,
    MatchOutcomeCountsModule,
    PlayersQueriesModule,
    TrophyAwardCountsModule,
  ],
  providers: [TeamsStatisticsService, TeamAverageStatisticsService],
  exports: [TeamsStatisticsService, TeamAverageStatisticsService],
})
export class TeamsQueriesModule {}
