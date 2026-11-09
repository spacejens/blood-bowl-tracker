import { Module } from '@nestjs/common';

import { MatchEventCountsModule } from '../shared/match-event-counts.module';
import { PlayerDeathService } from './player-death.service';
import { PlayerDeepdiveCountsService } from './player-deepdive-counts.service';

@Module({
  imports: [MatchEventCountsModule],
  providers: [PlayerDeathService, PlayerDeepdiveCountsService],
  exports: [PlayerDeathService, PlayerDeepdiveCountsService],
})
export class PlayersQueriesModule {}
