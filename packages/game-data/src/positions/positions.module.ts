import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { PositionsService } from './positions.service';

@Module({
  imports: [LikePatternModule],
  providers: [PositionsService],
  exports: [PositionsService],
})
export class PositionsModule {}
