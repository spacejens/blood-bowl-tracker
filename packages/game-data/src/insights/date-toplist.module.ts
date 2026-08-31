import { Module } from '@nestjs/common';

import { CalendarDatesModule } from '../shared/calendar-dates.module';
import { MatchScopeFilterModule } from '../shared/match-scope-filter.module';
import { DateToplistService } from './date-toplist.service';

@Module({
  imports: [CalendarDatesModule, MatchScopeFilterModule],
  providers: [DateToplistService],
  exports: [DateToplistService],
})
export class DateToplistModule {}
