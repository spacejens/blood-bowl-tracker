import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { TrophiesService } from './trophies.service';

@Module({
  imports: [LikePatternModule],
  providers: [TrophiesService],
  exports: [TrophiesService],
})
export class TrophiesModule {}
