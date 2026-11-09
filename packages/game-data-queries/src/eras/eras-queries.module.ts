import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { ErasQueriesService } from './eras-queries.service';

@Module({
  imports: [LikePatternModule],
  providers: [ErasQueriesService],
  exports: [ErasQueriesService],
})
export class ErasQueriesModule {}
