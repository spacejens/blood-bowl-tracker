import { SppModule } from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { MatchEventCountsModule } from '../shared/match-event-counts.module';
import { IncompleteImportPlayersService } from './incomplete-import-players.service';
import { PlayerDeathService } from './player-death.service';
import { PlayerDeepdiveCountsService } from './player-deepdive-counts.service';
import { PlayersQueriesService } from './players-queries.service';
import { StarPlayersService } from './star-players.service';

@Module({
  imports: [LikePatternModule, MatchEventCountsModule, SppModule],
  providers: [
    IncompleteImportPlayersService,
    PlayerDeathService,
    PlayerDeepdiveCountsService,
    PlayersQueriesService,
    StarPlayersService,
  ],
  exports: [
    IncompleteImportPlayersService,
    PlayerDeathService,
    PlayerDeepdiveCountsService,
    PlayersQueriesService,
    StarPlayersService,
  ],
})
export class PlayersQueriesModule {}
