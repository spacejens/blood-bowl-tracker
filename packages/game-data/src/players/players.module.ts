import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { MatchEventCountsModule } from '../shared/match-event-counts.module';
import { PlayerContextNamesModule } from '../shared/player-context-names.module';
import { SppModule } from '../spp/spp.module';
import { PlayerDeathService } from './player-death.service';
import { PlayerDeepdiveCountsService } from './player-deepdive-counts.service';
import { PlayersService } from './players.service';
import { StarPlayersService } from './star-players.service';

@Module({
  imports: [
    LikePatternModule,
    MatchEventCountsModule,
    PlayerContextNamesModule,
    SppModule,
  ],
  providers: [
    PlayersService,
    PlayerDeathService,
    PlayerDeepdiveCountsService,
    StarPlayersService,
  ],
  exports: [PlayersService, PlayerDeathService, StarPlayersService],
})
export class PlayersModule {}
