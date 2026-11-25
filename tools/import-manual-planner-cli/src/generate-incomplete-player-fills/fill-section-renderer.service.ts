import {
  NAME_EXTERNAL_SYSTEM,
  TP_EXTERNAL_SYSTEM,
} from '@blood-bowl-tracker/domain-enums';
import {
  IncompletePlayerFillEntrySchema,
  LastingInjuryRepairEntrySchema,
} from '@blood-bowl-tracker/manual-batch';
import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';
import { z } from 'zod';

import type { FillEntry, LastingInjuryRepairEntry } from './fill-plan.types';

const HEADER = [
  '// The data of TP players the TP import left incomplete whose data could be',
  '// proven: players too low on SPP to have advanced (no advancements, the',
  '// whole total unspent, stat reductions applied when they certainly still',
  '// apply; a marked journeyman with journeyman: true and his Loner left to',
  '// the server), players whose advancements the TP feed reports prove in',
  '// order and to the SPP spent, and players whose TP roster snapshots show',
  '// skills only one order and source of fit the SPP spent, any TP feed',
  '// reports of them fixing where their skills sit. Then the',
  '// complete TP players with a stat reduction recorded in a match and none',
  '// stored, for the server to record the lasting reductions their stored',
  '// data shows. Generated from the production database by',
  '// import-manual-planner-cli generate-incomplete-player-fills; see',
  '// docs/import-manual/filling-missing-players.md#generated-fills.',
];

/**
 * Renders planned fills as a manual-import batch file: the systems the
 * entries reference, then the entries.
 *
 * Pure formatting and schema checking, with no I/O and no dependencies.
 */
@Injectable()
export class FillSectionRendererService {
  render(
    entries: readonly FillEntry[],
    repairEntries: readonly LastingInjuryRepairEntry[],
  ): string {
    const fills = z.array(IncompletePlayerFillEntrySchema).safeParse(entries);
    if (!fills.success) {
      throw new Error(
        `Generated incompletePlayerFills do not match the batch schema: ${fills.error.message}`,
      );
    }
    const repairs = z
      .array(LastingInjuryRepairEntrySchema)
      .safeParse(repairEntries);
    if (!repairs.success) {
      throw new Error(
        `Generated lastingInjuryRepairs do not match the batch schema: ${repairs.error.message}`,
      );
    }
    const body = JSON5.stringify(
      {
        externalSystems: [NAME_EXTERNAL_SYSTEM, TP_EXTERNAL_SYSTEM],
        incompletePlayerFills: entries,
        lastingInjuryRepairs: repairEntries,
      },
      { space: 2, quote: "'" },
    );
    return `${HEADER.join('\n')}\n${body}\n`;
  }
}
