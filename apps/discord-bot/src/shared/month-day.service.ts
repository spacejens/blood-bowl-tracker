import { Injectable } from '@nestjs/common';

import { ClockService } from './clock.service';

export interface MonthDay {
  month: number;
  day: number;
}

const MONTH_DAY_PATTERN = /^(\d{2})-(\d{2})$/;

/**
 * Maximum day in each month (1-indexed). February is 29 because February 29 is
 * a real calendar date treated as its own date, matching only actual leap-year
 * rows. A MonthDay carries no year, so there is nothing further to validate
 * about leap years — February 29 is always valid.
 */
const DAYS_IN_MONTH = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Parses and formats calendar dates as month/day pairs (MM-DD), independent
 * of any year. Intended for recurring dates like holidays or anniversaries that
 * occur on the same day each year.
 */
@Injectable()
export class MonthDayService {
  constructor(private readonly clock: ClockService) {}

  /**
   * Parses a string as a month/day pair in MM-DD format. Returns null if the
   * input has the wrong shape (anything other than two digits, a hyphen, two
   * digits), an out-of-range month (outside 1 to 12) or day (outside 1 to the
   * number of days that month can have), or a calendar impossibility like
   * 02-30. The caller rejects null with a message rather than silently falling
   * back to today.
   */
  parse(value: string): MonthDay | null {
    const match = MONTH_DAY_PATTERN.exec(value);
    const month = match === null ? 0 : Number(match[1]);
    const day = match === null ? 0 : Number(match[2]);
    const valid =
      month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month];
    return valid ? { month, day } : null;
  }

  /**
   * Returns today's month and day from the clock.
   */
  today(): MonthDay {
    const now = this.clock.now();
    return { month: now.getMonth() + 1, day: now.getDate() };
  }

  /**
   * Formats a month/day pair as English text, e.g. "February 29".
   */
  format(monthDay: MonthDay): string {
    return MONTH_NAMES[monthDay.month] + ' ' + monthDay.day;
  }
}
