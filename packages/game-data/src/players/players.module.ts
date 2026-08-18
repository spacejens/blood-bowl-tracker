import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { SppModule } from '../spp/spp.module';
import { PlayerDeathService } from './player-death.service';
import { PlayersService } from './players.service';

@Module({
  imports: [LikePatternModule, SppModule],
  providers: [PlayersService, PlayerDeathService],
  exports: [PlayersService, PlayerDeathService],
})
export class PlayersModule {}
