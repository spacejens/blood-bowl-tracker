import { Module } from '@nestjs/common';

import { MatchEventCountsService } from './match-event-counts.service';
import { MatchScopeFilterModule } from './match-scope-filter.module';

@Module({
  imports: [MatchScopeFilterModule],
  providers: [MatchEventCountsService],
  exports: [MatchEventCountsService],
})
export class MatchEventCountsModule {}
