import { Module } from '@nestjs/common';

import { LikePatternService } from './like-pattern.service';

@Module({
  providers: [LikePatternService],
  exports: [LikePatternService],
})
export class LikePatternModule {}
