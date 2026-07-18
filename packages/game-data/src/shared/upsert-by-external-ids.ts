import type { Db } from '@blood-bowl-tracker/db';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import { resolveExistingByExternalIds } from './resolve-existing-by-external-ids';
import type { ExternalIdPair } from './sync-external-ids';
import { insertMissingExternalIds } from './sync-external-ids';
import { UpsertConflictError } from './upsert-conflict-error';

/**
 * Everything the shared upsert preamble needs. The two table type parameters
 * keep `values` checked against the entity table and the returned `row`
 * strongly typed per call site (structurally the db package's row type),
 * exactly as the hand-written per-service code did.
 */
export interface UpsertByExternalIdsOptions<
  TEntityTable extends PgTable,
  TExternalIdTable extends PgTable,
> {
  db: Db;
  /** The entity table to insert into / update (e.g. `eras`). */
  entityTable: TEntityTable;
  /** The entity table's primary-key column, for the update WHERE (e.g. `eras.id`). */
  entityIdColumn: PgColumn;
  /** Column values for the insert/update (e.g. `{ name, leagueId, ... }`). */
  values: InferInsertModel<TEntityTable>;
  /** The external-id join table (e.g. `eraExternalIds`). */
  externalIdTable: TExternalIdTable;
  /** The owner FK column on the join table (e.g. `eraExternalIds.eraId`). */
  ownerIdColumn: PgColumn;
  externalSystemIdColumn: PgColumn;
  externalIdColumn: PgColumn;
  externalIds: readonly ExternalIdPair[];
  /** The entity's own conflict-error subclass, thrown on a >1-owner match. */
  ConflictErrorClass: new (message: string) => UpsertConflictError;
  /** Lowercase plural entity label for the conflict message (e.g. `eras`). */
  entityLabelPlural: string;
  /** Builds one join-table insert row from the new/updated owner id and a pair. */
  buildExternalIdRow: (
    ownerId: number,
    pair: ExternalIdPair,
  ) => InferInsertModel<TExternalIdTable>;
}

/**
 * The resolve -> conflict-guard -> insert-or-update -> insert-missing-external-ids
 * preamble shared by every game-data upsert(). Callers keep only their
 * genuinely-divergent tail (join-table syncs, return shape) and pass the
 * one-per-entity pieces (conflict class, label, column wiring, buildRow) in.
 *
 * `insertMissingExternalIds` always runs immediately after the insert/update,
 * before any caller tail. Both are independent inserts into unrelated tables,
 * so the order is not observable.
 *
 * Kept internal to this package (not re-exported from index.ts), like
 * resolve-existing-by-external-ids.ts and sync-external-ids.ts.
 */
export async function upsertByExternalIds<
  TEntityTable extends PgTable,
  TExternalIdTable extends PgTable,
>(
  opts: UpsertByExternalIdsOptions<TEntityTable, TExternalIdTable>,
): Promise<{ row: InferSelectModel<TEntityTable>; created: boolean }> {
  const { ownerIds, existingRows } = await resolveExistingByExternalIds(opts);

  if (ownerIds.length > 1) {
    throw new opts.ConflictErrorClass(
      `External IDs matched multiple existing ${opts.entityLabelPlural}: ${ownerIds.join(', ')}`,
    );
  }

  const created = ownerIds.length === 0;
  const rows = created
    ? ((await opts.db
        .insert(opts.entityTable)
        .values(opts.values)
        .returning()) as InferSelectModel<TEntityTable>[])
    : ((await opts.db
        .update(opts.entityTable)
        .set(opts.values)
        .where(eq(opts.entityIdColumn, ownerIds[0]))
        .returning()) as InferSelectModel<TEntityTable>[]);
  const row = rows[0];
  const ownerId = (row as { id: number }).id;

  await insertMissingExternalIds({
    db: opts.db,
    externalIdTable: opts.externalIdTable,
    existingRows,
    externalIds: opts.externalIds,
    buildRow: (pair) => opts.buildExternalIdRow(ownerId, pair),
  });

  return { row, created };
}
