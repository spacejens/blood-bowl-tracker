import { Injectable } from '@nestjs/common';

import type { TableCell, TableRow } from '../shared/html.service';
import { HtmlService } from '../shared/html.service';
import type { PlayerSppRow } from './spp-totals-lookup.service';

const NONE = '—';
const MISMATCH = 'MISMATCH';
const EMPTY_NOTE = 'No players in scope for this match.';

const HEADERS: TableCell[] = [
  'Player',
  'Team',
  'spp_total',
  'spp_adjustment',
  'Flag',
];

/**
 * The trusted side of the SPP comparison: what the importers actually stored
 * on `game_data.players`. A NULL total is shown as an em dash and always
 * flagged — "nothing was stored" is exactly the kind of gap this panel exists
 * to surface.
 */
@Injectable()
export class SppImportedRendererService {
  constructor(private readonly html: HtmlService) {}

  render(rows: readonly PlayerSppRow[]): string {
    if (rows.length === 0) {
      return this.html.note(EMPTY_NOTE);
    }
    return this.html.table(
      HEADERS,
      rows.map((row): TableRow => {
        const cells: TableCell[] = [
          row.playerName,
          row.teamName,
          row.sppTotal === null ? NONE : String(row.sppTotal),
          row.sppAdjustment === null ? NONE : String(row.sppAdjustment),
          row.mismatch ? MISMATCH : NONE,
        ];
        return row.mismatch ? this.html.highlight(cells) : cells;
      }),
    );
  }
}
