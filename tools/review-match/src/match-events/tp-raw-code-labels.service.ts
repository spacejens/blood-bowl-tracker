import { Injectable } from '@nestjs/common';

/**
 * Human-readable hints for TP's numeric `matchEvents[].matchEventType` codes.
 *
 * Deliberately this module's own table, kept independent of
 * `packages/parse-tp`'s decoders: if that mapping is wrong, a report built
 * from it would show the same wrong label on both sides and hide the bug.
 * Codes absent here are shown bare, which is also the honest answer for
 * structural/no-op rows (0, 1, 18, 19, 27) the importer drops.
 */
@Injectable()
export class TpRawCodeLabelService {
  private readonly labels = new Map<number, string>([
    [3, 'completion'],
    [4, 'touchdown'],
    [5, 'interception'],
    [6, 'casualty caused'],
    [7, 'MVP award'],
    [8, 'injury'],
    [10, 'weather'],
    [11, 'inducements roll'],
    [12, 'winnings'],
    [13, 'fan factor'],
    [14, 'expensive mistake'],
    [15, 'journeyman signing'],
    [20, 'concession'],
    [23, 'prayers to Nuffle'],
    [25, 'deflection'],
    [26, 'dedicated fans roll'],
    [31, 'foul'],
    [32, 'sent off'],
    [42, 'secret objective'],
    [46, 'successful landing'],
  ]);

  /** `"<code> (<label>)"`, or just `"<code>"` when the code is unknown. */
  describe(code: number): string {
    const label = this.labels.get(code);
    return label === undefined ? String(code) : `${code} (${label})`;
  }
}
