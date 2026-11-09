import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { TeamRaceCoachNamesModule } from '../shared/team-race-coach-names.module';
import { TeamsService } from './teams.service';

@Module({
  imports: [LikePatternModule, TeamRaceCoachNamesModule],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
