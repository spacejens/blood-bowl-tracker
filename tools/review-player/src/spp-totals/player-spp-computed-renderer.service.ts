import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { PlayerSppTotals } from './player-spp-lookup.service';

const MISMATCH = 'MISMATCH';

/**
 * The independently-derived side of one player's SPP comparison: what their
 * stored match events add up to. The verdict row is highlighted *and*
 * labelled, so the signal survives without colour.
 */
@Injectable()
export class PlayerSppComputedRendererService {
  constructor(private readonly html: HtmlService) {}

  render(totals: PlayerSppTotals): string {
    const verdict: TableCell[] = [
      'Agrees with stored total',
      totals.mismatch ? MISMATCH : 'yes',
    ];
    const rows: TableRow[] = [
      ['Computed total (sum of match events)', String(totals.computedTotal)],
      ['SPP-earning events', String(totals.eventCount)],
      totals.mismatch ? this.html.highlight(verdict) : verdict,
    ];
    const table = this.html.table(['Field', 'Value'], rows);
    if (totals.nonStandardEvents.length === 0) {
      return table;
    }
    const eventRows: TableRow[] = totals.nonStandardEvents.map((event) =>
      this.html.highlight([
        event.actionType,
        String(event.recordedValue),
        String(event.expectedValue),
      ]),
    );
    const eventsTable = this.html.table(
      ['Action type', 'Recorded SPP', 'Expected SPP'],
      eventRows,
    );
    return table + eventsTable;
  }
}
