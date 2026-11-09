import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { PositionsQueriesService } from './positions-queries.service';

@Module({
  imports: [LikePatternModule],
  providers: [PositionsQueriesService],
  exports: [PositionsQueriesService],
})
export class PositionsQueriesModule {}
