import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { CompetitionGroupsQueriesService } from './competition-groups-queries.service';

@Module({
  imports: [LikePatternModule],
  providers: [CompetitionGroupsQueriesService],
  exports: [CompetitionGroupsQueriesService],
})
export class CompetitionGroupsQueriesModule {}
