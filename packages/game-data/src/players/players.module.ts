import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { SppModule } from '../spp/spp.module';
import { PlayersService } from './players.service';

@Module({
  imports: [LikePatternModule, SppModule],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
