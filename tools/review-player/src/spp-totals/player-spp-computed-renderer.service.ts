import { Injectable } from '@nestjs/common';

import type { TableCell, TableRow } from '../shared/html.service';
import { HtmlService } from '../shared/html.service';
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
    return this.html.table(['Field', 'Value'], rows);
  }
}
