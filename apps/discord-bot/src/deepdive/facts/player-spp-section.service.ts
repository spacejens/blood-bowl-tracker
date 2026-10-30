import type { UnspentSppResult } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { NumberFormatterService } from '../../shared/number-formatter.service';
import { UnspentSppLineService } from './unspent-spp-line.service';

export interface PlayerSppSectionInput {
  sppTotal: number | null;
  sppAdjustment: number | null;
  /**
   * The player's unspent SPP lookup: `undefined` when it was not looked up
   * (or found no such player), so no unspent line is shown; `null` when it
   * timed out or failed, shown as unknown.
   */
  unspent: UnspentSppResult | null | undefined;
}

/**
 * The player deepdive's trailing total section: nothing at all when no total
 * has been computed (null), otherwise a blank separator line, an optional
 * adjustment line, the total, and the unspent SPP line. A computed total of 0
 * is shown: unlike a zero category count, it is a real value rather than an
 * absence. `sppTotal` already includes `sppAdjustment`, so the adjustment
 * line calls that out explicitly rather than leaving a reader to assume the
 * two lines should be summed. `sppAdjustment` is clamped non-negative
 * wherever it's written today (`SppAdjustmentsService`), so the
 * negative-sign branch below is defensive against a future or
 * manually-edited negative value.
 */
@Injectable()
export class PlayerSppSectionService {
  constructor(
    private readonly numbers: NumberFormatterService,
    private readonly unspentLine: UnspentSppLineService,
  ) {}

  build({ sppTotal, sppAdjustment, unspent }: PlayerSppSectionInput): string[] {
    if (sppTotal === null) {
      return [];
    }
    const adjustmentLines =
      sppAdjustment === null || sppAdjustment === 0
        ? []
        : [
            `SPP adjustment: ${
              sppAdjustment > 0
                ? `+${this.numbers.count(sppAdjustment)}`
                : this.numbers.count(sppAdjustment)
            } (included)`,
          ];
    return [
      '',
      ...adjustmentLines,
      `Total SPP: ${this.numbers.count(sppTotal)}`,
      ...(unspent === undefined ? [] : [this.unspentLine.build(unspent)]),
    ];
  }
}
