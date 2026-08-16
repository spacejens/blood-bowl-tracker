import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { TeamsService } from './teams.service';
import { TeamsStatisticsService } from './teams-statistics.service';

@Module({
  imports: [LikePatternModule],
  providers: [TeamsService, TeamsStatisticsService],
  exports: [TeamsService],
})
export class TeamsModule {}
