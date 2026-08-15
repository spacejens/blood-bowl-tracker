import type { Db } from '@blood-bowl-tracker/db';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { eq, getTableColumns } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import { MissingRequiredFieldError } from './missing-required-field-error';
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
  /**
   * Column values for the insert/update (e.g. `{ name, leagueId, ... }`).
   *
   * Partial by design: a key with value `undefined` means "this payload says
   * nothing about that column". Such keys are stripped before the database is
   * touched, so an update leaves the stored value alone (overlay semantics).
   * A key present with value `null` is a real write of `null`, which is how a
   * caller actively clears a nullable column.
   */
  values: Partial<InferInsertModel<TEntityTable>>;
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
 * A copy of `values` without the keys whose value is `undefined`. Keys holding
 * `null` survive — `null` is a value being written, `undefined` is the absence
 * of any instruction about that column.
 *
 * Module-private helper of `upsertByExternalIds`, which is itself the
 * "generic over entity/table type" exception to the services-not-functions
 * convention (see CLAUDE.md): it cannot receive an injected collaborator.
 */
function stripUndefined(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}

/**
 * Widens a generic `TEntityTable extends PgTable` to the concrete `PgTable`
 * base type. `.from()`'s overload resolution can't evaluate the deferred
 * conditional type it uses to reject data-modifying-statement subqueries
 * while the argument is still a naked generic type parameter; passing it
 * through this identity function first resolves the parameter to a concrete
 * `PgTable`, which the overload accepts structurally, no cast required.
 */
function asBaseTable(table: PgTable): PgTable {
  return table;
}

/**
 * Property names of every column the table requires on INSERT that `supplied`
 * does not carry: NOT NULL, with no database-level default, and not the
 * primary key. A repo-wide audit of `packages/db/src/schema/*.ts` confirms the
 * defaulted columns are the `serial` primary key, the four columns
 * `historyTrackedTable` injects (createdAt/updatedAt/historyVersion/
 * historyPeriod), and `competitions.competition_group_id` /
 * `trophies.competition_group_id` (which default to the seeded "Major Season"
 * group so the BBL/TP importers, which do not classify competitions yet, keep
 * working -- issue #446). All of them report `hasDefault`, so this predicate
 * never flags a column that would have populated itself.
 */
function missingRequiredColumns(
  entityTable: PgTable,
  supplied: Record<string, unknown>,
): string[] {
  return Object.entries(getTableColumns(entityTable))
    .filter(
      ([key, column]) =>
        column.notNull &&
        !column.hasDefault &&
        !column.primary &&
        !(key in supplied),
    )
    .map(([key]) => key);
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
 * `values` is partial: keys whose value is `undefined` are stripped before the
 * database sees them, so an update never overwrites a column the payload said
 * nothing about. An explicit `null` still writes `null`. If every key is
 * stripped the update is skipped and the row is re-selected instead;
 * on the insert path a payload missing a required column throws
 * `MissingRequiredFieldError` rather than surfacing a raw Postgres NOT NULL
 * violation naming a database column instead of the sync field.
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

  const values = stripUndefined(opts.values);

  let rows: InferSelectModel<TEntityTable>[];
  if (created) {
    const missing = missingRequiredColumns(opts.entityTable, values);
    if (missing.length > 0) {
      throw new MissingRequiredFieldError(
        `Cannot create new ${opts.entityLabelPlural}: missing required field(s): ${missing.join(', ')}`,
      );
    }
    rows = (await opts.db
      .insert(opts.entityTable)
      .values(values as unknown as InferInsertModel<TEntityTable>)
      .returning()) as InferSelectModel<TEntityTable>[];
  } else if (Object.keys(values).length === 0) {
    // Nothing to write: drizzle rejects `.set({})`, and there is nothing to
    // change anyway. Read the row back so `{ row, created }` is unaffected.
    rows = (await opts.db
      .select()
      .from(asBaseTable(opts.entityTable))
      .where(
        eq(opts.entityIdColumn, ownerIds[0]),
      )) as InferSelectModel<TEntityTable>[];
  } else {
    rows = (await opts.db
      .update(opts.entityTable)
      .set(values as unknown as InferInsertModel<TEntityTable>)
      .where(eq(opts.entityIdColumn, ownerIds[0]))
      .returning()) as InferSelectModel<TEntityTable>[];
  }
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
