import { Injectable } from '@nestjs/common';

/** The minimum a row must carry to be sorted into an era section. */
export type EraGroupable = { eraId: number; eraName: string };

/** One era's heading and the rows that fall under it, in input order. */
export type EraSection<T extends EraGroupable> = {
  eraName: string;
  rows: T[];
};

/**
 * Splits an already-ordered row list into per-era sections, so a long list
 * (a trophy's recipients, a competition group's instances) can be rendered
 * under one heading per era instead of as one flat scroll that repeats the
 * era on every row.
 *
 * Deliberately groups by *adjacent* era rather than bucketing every row of an
 * era together: both call sites fetch their rows through a chronologically
 * ordered query, so two rows of one era are always adjacent already. Keeping
 * this an order-preserving grouping — never a sort — means the caller's own
 * order (newest-first for trophies, oldest-first for competition groups) is
 * the order the sections come out in, with no second ordering rule hidden in
 * here.
 */
@Injectable()
export class EraSectionGrouperService {
  group<T extends EraGroupable>(rows: T[]): EraSection<T>[] {
    const sections: EraSection<T>[] = [];
    for (const row of rows) {
      const current = sections[sections.length - 1];
      if (current === undefined || current.rows[0].eraId !== row.eraId) {
        sections.push({ eraName: row.eraName, rows: [row] });
      } else {
        current.rows.push(row);
      }
    }
    return sections;
  }
}
