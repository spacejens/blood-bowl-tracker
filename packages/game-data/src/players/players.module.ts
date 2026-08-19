import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { SppModule } from '../spp/spp.module';
import { PlayerDeathService } from './player-death.service';
import { PlayersService } from './players.service';
import { StarPlayersService } from './star-players.service';

@Module({
  imports: [LikePatternModule, SppModule],
  providers: [PlayersService, PlayerDeathService, StarPlayersService],
  exports: [PlayersService, PlayerDeathService, StarPlayersService],
})
export class PlayersModule {}
