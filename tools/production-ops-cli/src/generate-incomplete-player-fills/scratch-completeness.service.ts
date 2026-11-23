import { Injectable } from '@nestjs/common';

import type { TpRosterCopyGroup } from '../read-tp-roster-snapshots/tp-roster-snapshots.schema';
import type { FillEntry, LastingInjuryRepairEntry } from './fill-plan.types';
import { ManualBatchFillsStoreService } from './manual-batch-fills-store.service';

export interface ScratchCompletenessInput {
  repairs: readonly LastingInjuryRepairEntry[];
  /** The snapshots' roster copies: who the copies the TP import sends list. */
  rosterCopies: readonly TpRosterCopyGroup[];
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
 * scratch has the player complete when the batch repairs him: an earlier
 * batch fills him, this run fills him, or the roster copies the TP import
 * sends list him and no copy it does not send is the only one listing him.
 * The server refuses a repair of a player still incomplete, which stops the
 * batch, so the others are left out.
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
    const split: ScratchCompletenessSplit = { safe: [], unsafe: [] };
    for (const repair of input.repairs) {
      const id = repair.player.id;
      if (filled.has(id) || (listed.has(id) && !elsewhere.has(id))) {
        split.safe.push(repair);
      } else {
        split.unsafe.push(id);
      }
    }
    return split;
  }
}
