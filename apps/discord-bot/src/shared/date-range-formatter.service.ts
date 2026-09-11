import { Injectable } from '@nestjs/common';

/**
 * Renders an entity's date span for Discord embeds: `2021-09-01 – 2023-06-10`
 * for a closed range, `2021-09-01 – present` for an ongoing one (`endDate`
 * null), and a bare `2024-03-16` when the range is a single day (a one-day
 * cup). Shared by the era and competition renderers so the three cases are
 * decided in exactly one place. Dates are already ISO `YYYY-MM-DD` strings
 * coming out of drizzle's `date` columns, so no parsing is involved.
 */
@Injectable()
export class DateRangeFormatterService {
  format(startDate: string, endDate: string | null): string {
    if (endDate === null) {
      return `${startDate} – present`;
    }
    if (endDate === startDate) {
      return startDate;
    }
    return `${startDate} – ${endDate}`;
  }

  /**
   * Renders a named entity together with its date span, e.g.
   * `Season 5 (2020-01-01 – 2023-12-31)`. Shared by every renderer that shows
   * an era or competition name alongside its dates, so the `<name> (<range>)`
   * shape is decided in exactly one place.
   */
  formatNamed(name: string, startDate: string, endDate: string | null): string {
    return `${name} (${this.format(startDate, endDate)})`;
  }
}
