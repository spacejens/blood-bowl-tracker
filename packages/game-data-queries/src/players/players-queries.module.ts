import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { MatchEventCountsModule } from '../shared/match-event-counts.module';
import { IncompleteImportPlayersService } from './incomplete-import-players.service';
import { PlayerDeathService } from './player-death.service';
import { PlayerDeepdiveCountsService } from './player-deepdive-counts.service';
import { StarPlayersService } from './star-players.service';

@Module({
  imports: [LikePatternModule, MatchEventCountsModule],
  providers: [
    IncompleteImportPlayersService,
    PlayerDeathService,
    PlayerDeepdiveCountsService,
    StarPlayersService,
  ],
  exports: [
    IncompleteImportPlayersService,
    PlayerDeathService,
    PlayerDeepdiveCountsService,
    StarPlayersService,
  ],
})
export class PlayersQueriesModule {}
