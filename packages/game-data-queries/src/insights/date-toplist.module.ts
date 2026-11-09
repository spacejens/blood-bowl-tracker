import { MatchScopeFilterModule } from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { CalendarDatesModule } from '../shared/calendar-dates.module';
import { DateToplistService } from './date-toplist.service';

@Module({
  imports: [CalendarDatesModule, MatchScopeFilterModule],
  providers: [DateToplistService],
  exports: [DateToplistService],
})
export class DateToplistModule {}
