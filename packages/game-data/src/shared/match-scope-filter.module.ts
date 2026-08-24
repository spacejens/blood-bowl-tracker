import { Module } from '@nestjs/common';

import { MatchScopeFilterService } from './match-scope-filter.service';

@Module({
  providers: [MatchScopeFilterService],
  exports: [MatchScopeFilterService],
})
export class MatchScopeFilterModule {}
