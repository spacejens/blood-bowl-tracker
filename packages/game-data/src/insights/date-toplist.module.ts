import { Module } from '@nestjs/common';

import { MatchScopeFilterModule } from '../shared/match-scope-filter.module';
import { DateToplistService } from './date-toplist.service';

@Module({
  imports: [MatchScopeFilterModule],
  providers: [DateToplistService],
  exports: [DateToplistService],
})
export class DateToplistModule {}
