import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

/**
 * Every calendar date that can exist, as a subquery — the candidate set for
 * any ranking that must include dates no row in the data mentions.
 *
 * The calendar is synthesized in SQL rather than stored: `generate_series`
 * over the year 2000 (a leap year, so February 29 is naturally included)
 * yields all 366 month/day pairs, with no year dependency of its own — the
 * same year-agnostic notion of a date `OnThisDateService` uses.
 */
@Injectable()
export class CalendarDatesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** All 366 `{month, day}` pairs, aliased `calendar_dates` for joining. */
  allDates() {
    return this.db
      .select({
        month: sql<number>`extract(month from d)::int`.as('month'),
        day: sql<number>`extract(day from d)::int`.as('day'),
      })
      .from(
        sql`generate_series(date '2000-01-01', date '2000-12-31', interval '1 day') as d`,
      )
      .as('calendar_dates');
  }
}

/** The subquery `allDates()` returns, named so callers can hold on to it. */
export type CalendarDates = ReturnType<CalendarDatesService['allDates']>;
