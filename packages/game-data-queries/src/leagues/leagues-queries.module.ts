import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { LeaguesQueriesService } from './leagues-queries.service';

@Module({
  imports: [LikePatternModule],
  providers: [LeaguesQueriesService],
  exports: [LeaguesQueriesService],
})
export class LeaguesQueriesModule {}
