import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { PlayerSppTotals } from './player-spp-lookup.service';

const NONE = '—';
const MISMATCH = 'MISMATCH';

/**
 * One player's SPP total in a single table: what an importer stored
 * (`players.spp_total` / `players.spp_adjustment`) beside what the player's
 * stored match events add up to. A NULL stored total is always a
 * disagreement — "nothing was stored" is exactly what this table exists to
 * surface. The verdict row is highlighted *and* labelled, so the signal
 * survives without colour. Events whose recorded SPP differs from the award
 * table follow in a table of their own, each row highlighted.
 */
@Injectable()
export class PlayerSppTotalsRendererService {
  constructor(private readonly html: HtmlService) {}

  render(totals: PlayerSppTotals): string {
    const verdict: TableCell[] = [
      'Agrees with computed total plus adjustment',
      totals.mismatch ? MISMATCH : 'yes',
    ];
    const rows: TableRow[] = [
      ['Stored total (spp_total)', this.value(totals.sppTotal)],
      ['Stored adjustment (spp_adjustment)', this.value(totals.sppAdjustment)],
      ['Computed total (sum of match events)', String(totals.computedTotal)],
      ['SPP-earning events', String(totals.eventCount)],
      totals.mismatch ? this.html.highlight(verdict, [1]) : verdict,
    ];
    const table = this.html.table(['Field', 'Value'], rows);
    if (totals.nonStandardEvents.length === 0) {
      return table;
    }
    return (
      table +
      this.html.table(
        ['Action type', 'Recorded SPP', 'Expected SPP'],
        totals.nonStandardEvents.map((event) =>
          this.html.highlight(
            [
              event.actionType,
              String(event.recordedValue),
              String(event.expectedValue),
            ],
            [1, 2],
          ),
        ),
      )
    );
  }

  private value(figure: number | null): string {
    return figure === null ? NONE : String(figure);
  }
}
