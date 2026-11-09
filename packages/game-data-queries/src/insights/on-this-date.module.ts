import { MatchScopeFilterModule } from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { PlayersQueriesModule } from '../players/players-queries.module';
import { OnThisDateService } from './on-this-date.service';

@Module({
  imports: [MatchScopeFilterModule, PlayersQueriesModule],
  providers: [OnThisDateService],
  exports: [OnThisDateService],
})
export class OnThisDateModule {}
