import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { MatchEventCountsModule } from '../shared/match-event-counts.module';
import { MatchOutcomeCountsModule } from '../shared/match-outcome-counts.module';
import { TeamRaceCoachNamesModule } from '../shared/team-race-coach-names.module';
import { TeamsService } from './teams.service';
import { TeamsStatisticsService } from './teams-statistics.service';

@Module({
  imports: [
    LikePatternModule,
    MatchEventCountsModule,
    MatchOutcomeCountsModule,
    TeamRaceCoachNamesModule,
  ],
  providers: [TeamsService, TeamsStatisticsService],
  exports: [TeamsService],
})
export class TeamsModule {}
