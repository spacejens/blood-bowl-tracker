import { Injectable } from '@nestjs/common';

import { DateRangeFormatterService } from './date-range-formatter.service';

/**
 * The minimum a row must carry to be sorted into an era section: which era it
 * belongs to, and that era's own span — the span is what lets the heading date
 * the era without every consumer fetching it separately.
 */
export type EraGroupable = {
  eraId: number;
  eraName: string;
  eraStartDate: string;
  eraEndDate: string | null;
};

/** One era's heading and the rows that fall under it, in input order. */
export type EraSection<T extends EraGroupable> = {
  /**
   * The era named and dated — `BB2020 (2020-01-01 – present)`. Built here
   * rather than at each call site so all four consumers head their sections
   * identically; each appends only its own noun (`recipients:`, `trophies:`,
   * `positions:`, `competitions:`).
   */
  eraHeading: string;
  rows: T[];
};

/**
 * Splits an already-ordered row list into per-era sections, so a long list
 * (a trophy's recipients, a competition group's instances) can be rendered
 * under one heading per era instead of as one flat scroll that repeats the
 * era on every row.
 *
 * Deliberately groups by *adjacent* era rather than bucketing every row of an
 * era together: every call site fetches its rows through a chronologically
 * ordered query, so two rows of one era are always adjacent already. Keeping
 * this an order-preserving grouping — never a sort — means the caller's own
 * order (newest-first for trophies, oldest-first for competition groups) is
 * the order the sections come out in, with no second ordering rule hidden in
 * here.
 */
@Injectable()
export class EraSectionGrouperService {
  constructor(private readonly dateRangeFormatter: DateRangeFormatterService) {}

  group<T extends EraGroupable>(rows: T[]): EraSection<T>[] {
    const sections: EraSection<T>[] = [];
    for (const row of rows) {
      const current = sections[sections.length - 1];
      if (current === undefined || current.rows[0].eraId !== row.eraId) {
        sections.push({
          eraHeading: this.dateRangeFormatter.formatNamed(
            row.eraName,
            row.eraStartDate,
            row.eraEndDate,
          ),
          rows: [row],
        });
      } else {
        current.rows.push(row);
      }
    }
    return sections;
  }
}
