import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { PlayersService } from './players.service';

@Module({
  imports: [LikePatternModule],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
