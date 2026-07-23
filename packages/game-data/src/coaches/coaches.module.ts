import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { CoachesService } from './coaches.service';

@Module({
  imports: [LikePatternModule],
  providers: [CoachesService],
  exports: [CoachesService],
})
export class CoachesModule {}
