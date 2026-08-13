import { Injectable } from '@nestjs/common';

import type { TableCell, TableRow } from '../shared/html.service';
import { HtmlService } from '../shared/html.service';
import type { PlayerSppTotals } from './player-spp-lookup.service';

const NONE = '—';
const MISMATCH = 'MISMATCH';

/**
 * The stored side of one player's SPP comparison: what an importer wrote to
 * `players.spp_total` / `players.spp_adjustment`. A NULL stored total is
 * always rendered as a disagreement — "nothing was stored" is exactly what
 * this panel exists to surface. The verdict row is highlighted *and*
 * labelled, so the signal survives without colour.
 */
@Injectable()
export class PlayerSppImportedRendererService {
  constructor(private readonly html: HtmlService) {}

  render(totals: PlayerSppTotals): string {
    const verdict: TableCell[] = [
      'Agrees with computed total',
      totals.mismatch ? MISMATCH : 'yes',
    ];
    const rows: TableRow[] = [
      ['spp_total', totals.sppTotal === null ? NONE : String(totals.sppTotal)],
      [
        'spp_adjustment',
        totals.sppAdjustment === null ? NONE : String(totals.sppAdjustment),
      ],
      totals.mismatch ? this.html.highlight(verdict) : verdict,
    ];
    return this.html.table(['Field', 'Value'], rows);
  }
}
