import type { InferInsertModel } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import type { DbOrTx } from './db-or-tx';

/** One (external system, id-in-that-system) pairing for an entity. */
export interface ExternalIdPair {
  externalSystemId: number;
  externalId: string;
}

/**
 * Insert the external-id pairings an entity does not already have, skipping the
 * database entirely when there are none. Shared by every game-data `upsert()`:
 * they differ only in the join table and the name of its owner FK column, and
 * the caller supplies both by closing over the owner id in `buildRow` — so the
 * helper never needs to know what the column is called.
 *
 * Kept internal to this package (not re-exported from index.ts), like
 * shared/count-all.ts.
 */
export interface InsertMissingExternalIdsOptions<T extends PgTable> {
  db: DbOrTx;
  externalIdTable: T;
  existingRows: readonly ExternalIdPair[];
  externalIds: readonly ExternalIdPair[];
  buildRow: (pair: ExternalIdPair) => InferInsertModel<T>;
}

export async function insertMissingExternalIds<T extends PgTable>(
  options: InsertMissingExternalIdsOptions<T>,
): Promise<void> {
  const { db, externalIdTable, existingRows, externalIds, buildRow } = options;
  const existingPairs = new Set(
    existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
  );
  const newExternalIds = externalIds.filter(
    (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
  );

  if (newExternalIds.length > 0) {
    await db.insert(externalIdTable).values(newExternalIds.map(buildRow));
  }
}
