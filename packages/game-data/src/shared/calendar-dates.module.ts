import { Module } from '@nestjs/common';

import { CalendarDatesService } from './calendar-dates.service';

@Module({
  providers: [CalendarDatesService],
  exports: [CalendarDatesService],
})
export class CalendarDatesModule {}
