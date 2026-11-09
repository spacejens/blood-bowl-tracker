import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { CompetitionsQueriesService } from './competitions-queries.service';

@Module({
  imports: [LikePatternModule],
  providers: [CompetitionsQueriesService],
  exports: [CompetitionsQueriesService],
})
export class CompetitionsQueriesModule {}
