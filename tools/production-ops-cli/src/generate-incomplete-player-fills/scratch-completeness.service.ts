import { Injectable } from '@nestjs/common';

import type { TpRosterCopyGroup } from '../read-tp-roster-snapshots/tp-roster-snapshots.schema';
import type { FillEntry, LastingInjuryRepairEntry } from './fill-plan.types';
import { ManualBatchFillsStoreService } from './manual-batch-fills-store.service';

export interface ScratchCompletenessInput {
  repairs: readonly LastingInjuryRepairEntry[];
  /** The snapshots' roster copies: who the copies the TP import sends list. */
  rosterCopies: readonly TpRosterCopyGroup[];
  /** The TP ids any downloaded match or roster file shows (`players`). */
  shown: readonly string[];
  /** This run's fills, which the batch applies before its repairs. */
  runFills: readonly FillEntry[];
  /** The repo-relative path the batch is written to, when one is given. */
  out?: string;
}

export interface ScratchCompletenessSplit {
  /** The repairs a database built from scratch can apply, in their order. */
  safe: LastingInjuryRepairEntry[];
  /** The TP ids of the repairs left out, in their order. */
  unsafe: string[];
}

/**
 * Splits the lasting-injury repairs by whether a database built from
 * scratch can apply them. It can when an earlier batch fills the player,
 * when this run fills him, or when every roster group listing him lists him
 * in the copy the TP import sends, so the import has him complete. It can
 * also when no downloaded file shows him at all: nothing creates him on a
 * scratch build, and the importer skips a repair of a player who does not
 * resolve. Any other player a file shows is still incomplete there, and the
 * server refuses his repair, which stops the batch, so it is left out.
 */
@Injectable()
export class ScratchCompletenessService {
  constructor(private readonly batches: ManualBatchFillsStoreService) {}

  async split(
    input: ScratchCompletenessInput,
  ): Promise<ScratchCompletenessSplit> {
    const before =
      input.out === undefined ? undefined : this.batches.batchOf(input.out);
    const filled = new Set(await this.batches.filledTpIds(before));
    for (const entry of input.runFills) {
      filled.add(entry.player.id);
    }
    const listed = new Set<string>();
    const elsewhere = new Set<string>();
    for (const group of input.rosterCopies) {
      for (const id of group.listed) {
        listed.add(id);
      }
      for (const id of group.listedElsewhere) {
        elsewhere.add(id);
      }
    }
    const shown = new Set(input.shown);
    const split: ScratchCompletenessSplit = { safe: [], unsafe: [] };
    for (const repair of input.repairs) {
      const id = repair.player.id;
      const sent = listed.has(id) && !elsewhere.has(id);
      const absent = !shown.has(id) && !listed.has(id) && !elsewhere.has(id);
      if (filled.has(id) || sent || absent) {
        split.safe.push(repair);
      } else {
        split.unsafe.push(id);
      }
    }
    return split;
  }
}
