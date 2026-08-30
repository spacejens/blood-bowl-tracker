import { Module } from '@nestjs/common';

import { PlayersModule } from '../players/players.module';
import { MatchScopeFilterModule } from '../shared/match-scope-filter.module';
import { OnThisDateService } from './on-this-date.service';

@Module({
  imports: [MatchScopeFilterModule, PlayersModule],
  providers: [OnThisDateService],
  exports: [OnThisDateService],
})
export class OnThisDateModule {}
