import type { Db } from '@blood-bowl-tracker/db';
import { asc, DB, eq, manualImportBatches } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { GameDataError } from '../shared/game-data-error';

/** One recorded batch, as the API answers with it. */
export interface ManualImportBatchRow {
  name: string;
  contentHash: string;
  appliedAt: Date;
}

/**
 * Thrown by `record` when the batch is already recorded under a different
 * content hash: the curated data of an applied batch was edited. Exported so
 * `packages/api-server` can map it onto the contract's CONFLICT error.
 */
export class ManualImportBatchContentMismatchError extends GameDataError {}

const columns = {
  name: manualImportBatches.name,
  contentHash: manualImportBatches.contentHash,
  appliedAt: manualImportBatches.appliedAt,
};

/**
 * The ledger of tools/import-manual batches applied to this database. Only
 * that tool writes it, through the `manualImportBatches` procedures.
 */
@Injectable()
export class ManualImportBatchesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every recorded batch, by name. */
  listAll(): Promise<ManualImportBatchRow[]> {
    return this.db
      .select(columns)
      .from(manualImportBatches)
      .orderBy(asc(manualImportBatches.name));
  }

  /**
   * Record one batch as applied. Recording it again with the same content
   * hash is a no-op answering `created: false`, so a retried call is safe; a
   * different hash means the batch was edited after it was applied, which is
   * rejected rather than silently overwriting the record.
   */
  async record(data: {
    name: string;
    contentHash: string;
  }): Promise<{ batch: ManualImportBatchRow; created: boolean }> {
    // One atomic insert: a concurrent record of the same name loses the race
    // quietly and falls through to the lookup, instead of failing on the
    // unique constraint.
    const [inserted] = await this.db
      .insert(manualImportBatches)
      .values(data)
      .onConflictDoNothing({ target: manualImportBatches.name })
      .returning(columns);
    if (inserted !== undefined) {
      return { batch: inserted, created: true };
    }
    const [existing] = await this.db
      .select(columns)
      .from(manualImportBatches)
      .where(eq(manualImportBatches.name, data.name));
    if (existing.contentHash !== data.contentHash) {
      throw new ManualImportBatchContentMismatchError(
        `Batch ${data.name} is already recorded with content hash ${existing.contentHash}, not ${data.contentHash}.`,
      );
    }
    return { batch: existing, created: false };
  }
}
