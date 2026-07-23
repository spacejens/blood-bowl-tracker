import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { CompetitionsService } from './competitions.service';

@Module({
  imports: [LikePatternModule],
  providers: [CompetitionsService],
  exports: [CompetitionsService],
})
export class CompetitionsModule {}
