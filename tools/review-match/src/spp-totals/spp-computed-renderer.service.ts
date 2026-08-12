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
  'SPP this match',
  'Computed total (all matches)',
  'Flag',
];

/**
 * The independently-derived side of the SPP comparison: what the player's
 * stored match events add up to. `HtmlService` is injected as a real provider
 * in this service's spec — it is a pure formatter with its own tests, and
 * mocking it would leave the produced markup unasserted.
 */
@Injectable()
export class SppComputedRendererService {
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
          String(row.matchTotal),
          String(row.computedTotal),
          row.mismatch ? MISMATCH : NONE,
        ];
        return row.mismatch ? this.html.highlight(cells) : cells;
      }),
    );
  }
}
