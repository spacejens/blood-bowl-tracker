import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { ErasService } from './eras.service';

@Module({
  imports: [LikePatternModule],
  providers: [ErasService],
  exports: [ErasService],
})
export class ErasModule {}
