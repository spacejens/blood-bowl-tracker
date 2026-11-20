import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';

import type { FillEntry, LastingInjuryRepairEntry } from './fill-plan.types';

const HEADER = [
  '// The data of TP players the TP import left incomplete whose data could be',
  '// proven: players too low on SPP to have advanced (no advancements, the',
  '// whole total unspent, stat reductions applied when they certainly still',
  '// apply; a marked journeyman with journeyman: true and his Loner left to',
  '// the server), and players whose advancements the TP feed reports prove',
  '// in order and to the SPP spent. Then the complete TP players with a stat',
  '// reduction recorded in a match and none stored, for the server to record',
  '// the lasting reductions their stored data shows. Generated from the',
  '// production database by production-ops-cli',
  '// generate-incomplete-player-fills; see',
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
  render(
    entries: readonly FillEntry[],
    repairs: readonly LastingInjuryRepairEntry[],
  ): string {
    const body = JSON5.stringify(
      {
        externalSystems: [
          { name: 'Name', category: 'bookkeeping' },
          { name: 'tourplay.net', category: 'imported_data_source' },
        ],
        incompletePlayerFills: entries,
        lastingInjuryRepairs: repairs,
      },
      { space: 2, quote: "'" },
    );
    return `${HEADER.join('\n')}\n${body}\n`;
  }
}
