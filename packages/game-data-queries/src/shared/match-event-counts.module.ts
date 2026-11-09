import { MatchScopeFilterModule } from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { MatchEventCountsService } from './match-event-counts.service';

@Module({
  imports: [MatchScopeFilterModule],
  providers: [MatchEventCountsService],
  exports: [MatchEventCountsService],
})
export class MatchEventCountsModule {}
