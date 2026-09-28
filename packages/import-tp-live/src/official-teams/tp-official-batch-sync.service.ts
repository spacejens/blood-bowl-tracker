import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/** One position's share of a stage's batched write. */
export interface TpOfficialBatchGroup<E> {
  entries: E[];
  /** Recorded as the ImportError's item when this group's own write fails. */
  item: unknown;
  buildErrorMessage: (error: unknown) => string;
}

/** Options for {@link TpOfficialBatchSyncService.syncGroups}. */
export interface SyncOfficialGroupsOptions<E> {
  groups: TpOfficialBatchGroup<E>[];
  /** The stage's packages/game-data sync, taking any number of entries. */
  sync: (entries: E[]) => Promise<unknown>;
  errors: ImportError[];
}

/**
 * Writes one official-teams stage (characteristics, keywords or starting
 * skills) for a whole rules set in a single packages/game-data sync call,
 * so the stage costs one round of queries instead of one per position.
 * Those syncs validate a batch all-or-nothing, so when the batch fails the
 * groups are retried one position at a time: the failing position is
 * reported by name and every other position is still written. Constructor-
 * free, no I/O of its own (it only calls the sync it is handed), so specs
 * may pass it as a real provider, like TpUpsertRunnerService.
 */
@Injectable()
export class TpOfficialBatchSyncService {
  /** Returns how many entries were written. An empty stage makes no call. */
  async syncGroups<E>({
    groups,
    sync,
    errors,
  }: SyncOfficialGroupsOptions<E>): Promise<number> {
    if (groups.length > 1) {
      try {
        await sync(groups.flatMap((group) => group.entries));
        return groups.reduce((sum, group) => sum + group.entries.length, 0);
      } catch {
        // One bad position fails the whole batch; the per-group pass below
        // finds it and still writes the rest.
      }
    }
    let written = 0;
    for (const group of groups) {
      try {
        await sync(group.entries);
        written += group.entries.length;
      } catch (error) {
        errors.push({
          item: group.item,
          message: group.buildErrorMessage(error),
        });
      }
    }
    return written;
  }
}
