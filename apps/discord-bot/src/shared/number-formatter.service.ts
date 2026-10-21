import { Injectable } from '@nestjs/common';

/**
 * The one way the Discord bot renders a quantity: grouped with en-US
 * thousands separators (`1,234`), and with a noun that agrees with the number
 * (`1 day`, `91 days`). Ranks, years, dates and ids are not quantities and
 * are printed raw by their callers instead.
 */
@Injectable()
export class NumberFormatterService {
  /** `1234` → `1,234`. */
  count(n: number): string {
    return n.toLocaleString('en-US');
  }

  /**
   * `count(n)` followed by the noun in the form that agrees with `n`. The
   * plural defaults to `singular + 's'`; pass it for irregular nouns
   * (`injury` / `injuries`).
   */
  counted(n: number, singular: string, plural = `${singular}s`): string {
    return `${this.count(n)} ${Math.abs(n) === 1 ? singular : plural}`;
  }
}
