import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { RacesService } from './races.service';

@Module({
  imports: [LikePatternModule],
  providers: [RacesService],
  exports: [RacesService],
})
export class RacesModule {}
