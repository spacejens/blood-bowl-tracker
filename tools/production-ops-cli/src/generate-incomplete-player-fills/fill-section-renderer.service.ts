import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';

import type { FillEntry } from './fill-plan.types';

const HEADER = [
  '// The data of TP players the TP import left incomplete whose total SPP is',
  '// below the cheapest advancement any rules set of their era prices, so they',
  "// have no advancements: each is his position's characteristics and starting",
  '// skills, and his whole total unspent. Players with a recorded stat',
  '// reduction are left out. Generated from the production database by',
  '// production-ops-cli generate-incomplete-player-fills; see',
  '// docs/import-manual/filling-missing-players.md#generated-fills.',
];

/**
 * Renders planned fills as a manual-import batch file: the systems the
 * entries reference, then the entries.
 *
 * Pure formatting, with no I/O and no dependencies.
 */
@Injectable()
export class FillSectionRendererService {
  render(entries: readonly FillEntry[]): string {
    const body = JSON5.stringify(
      {
        externalSystems: [
          { name: 'Name', category: 'bookkeeping' },
          { name: 'tourplay.net', category: 'imported_data_source' },
        ],
        incompletePlayerFills: entries,
      },
      { space: 2, quote: "'" },
    );
    return `${HEADER.join('\n')}\n${body}\n`;
  }
}
