import type { Db } from '@blood-bowl-tracker/db';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { eq, getTableColumns, getTableName } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { DbOrTx } from './db-or-tx';
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
  /**
   * Optional extra conflict check for the single-matched-owner case (the
   * >1-owner case already throws on its own, below). Some entities encode a
   * distinction — e.g. a position's `isStarPlayer` — that the external-id
   * match alone cannot see: an id that legitimately names a star position can
   * happen to collide with an already-upserted *regular* position's row (or
   * vice versa), and applying the update would silently overwrite that row's
   * identity rather than updating the entity the id actually names.
   *
   * Given the row the single matched owner id currently points at and the
   * (already-`undefined`-stripped) incoming `values`, return `true` when
   * applying `values` to that row would be such a silent corruption rather
   * than a legitimate update. When it returns `true`,
   * `ConflictErrorClass` is thrown instead of writing the update, exactly
   * like the >1-owner case.
   *
   * Left undefined by every entity that has no such distinction to protect —
   * the extra `select` this triggers only runs for entities that opt in.
   */
  detectSemanticConflict?: (
    existingRow: InferSelectModel<TEntityTable>,
    values: Partial<InferInsertModel<TEntityTable>>,
  ) => boolean;
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

/** Postgres' SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

/** One initial attempt plus two retries. */
const MAX_UPSERT_ATTEMPTS = 3;

/**
 * How many `.cause` links to walk while unwrapping a caught error before
 * giving up. drizzle-orm's pg-core session wraps exactly one level in
 * practice (see below), so 3 is generous headroom rather than a value tuned
 * to a specific stack.
 */
const MAX_CAUSE_UNWRAP_DEPTH = 3;

/**
 * True only for the specific violation a lost external-id race raises: a 23505
 * on the entity's own external-id join table.
 *
 * The caught value never carries the fields to test. drizzle-orm wraps every
 * query failure in a `DrizzleQueryError` that sets `cause` but copies neither
 * `code` nor `table_name`, so the `postgres` driver's `PostgresError` is only
 * reachable by walking `.cause` — bounded here defensively.
 *
 * Matching is on `table_name`, not the constraint name: Postgres truncates
 * identifiers to 63 bytes (`NAMEDATALEN`), and
 * `competition_groups_external_ids`' full constraint name is 69, so a
 * hand-reconstructed name would silently never match. Every external-id join
 * table has exactly one unique constraint besides its primary key, so the
 * table name identifies the race unambiguously and survives any rename.
 *
 * The SQLSTATE check stays alongside it so a future NOT NULL violation on the
 * same table is not retried three times and misreported. The primary key is
 * excluded for the same reason: a 23505 on `<table>_pkey` (a desynced
 * sequence, say) is an infrastructure bug, not this race. Comparing
 * `constraint_name` is safe there specifically because `<table>_pkey` is
 * always well under 63 bytes.
 */
function isExternalIdUniqueViolation(
  error: unknown,
  tableName: string,
): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_UNWRAP_DEPTH; depth++) {
    const typed = candidate as
      | {
          code?: unknown;
          table_name?: unknown;
          constraint_name?: unknown;
          cause?: unknown;
        }
      | undefined;
    if (
      typed?.code === UNIQUE_VIOLATION &&
      typed.table_name === tableName &&
      typed.constraint_name !== `${tableName}_pkey`
    ) {
      return true;
    }
    if (typeof typed !== 'object' || typed === null || !('cause' in typed)) {
      return false;
    }
    candidate = typed.cause;
  }
  return false;
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
 * only defaulted columns are the `serial` primary key and the four columns
 * `historyTrackedTable` injects (createdAt/updatedAt/historyVersion/
 * historyPeriod). Both report `hasDefault`, so this predicate never flags a
 * column that would have populated itself. Notably
 * `competitions.competition_group_id` is NOT NULL with no default, so
 * creating a competition without a curated classification is caught here and
 * reported as a `MissingRequiredFieldError` rather than landing silently in
 * an arbitrary group.
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
 * One attempt at the resolve -> conflict-guard -> insert-or-update ->
 * insert-missing-external-ids sequence. Every query is issued through
 * `handle`, so the caller can run the whole sequence inside a transaction and
 * have a failure anywhere roll back the entity row too.
 *
 * Module-private helper of `upsertByExternalIds`, which is itself the
 * "generic over entity/table type" exception to the services-not-functions
 * convention (see CLAUDE.md): it cannot receive an injected collaborator.
 */
async function runUpsertAttempt<
  TEntityTable extends PgTable,
  TExternalIdTable extends PgTable,
>(
  opts: UpsertByExternalIdsOptions<TEntityTable, TExternalIdTable>,
  handle: DbOrTx,
): Promise<{ row: InferSelectModel<TEntityTable>; created: boolean }> {
  const { ownerIds, existingRows } = await resolveExistingByExternalIds({
    ...opts,
    db: handle,
  });

  if (ownerIds.length > 1) {
    throw new opts.ConflictErrorClass(
      `External IDs matched multiple existing ${opts.entityLabelPlural}: ${ownerIds.join(', ')}`,
    );
  }

  const created = ownerIds.length === 0;

  const values = stripUndefined(opts.values);

  if (!created && opts.detectSemanticConflict) {
    const [existingRow] = (await handle
      .select()
      .from(asBaseTable(opts.entityTable))
      .where(
        eq(opts.entityIdColumn, ownerIds[0]),
      )) as InferSelectModel<TEntityTable>[];
    if (
      existingRow &&
      opts.detectSemanticConflict(
        existingRow,
        values as Partial<InferInsertModel<TEntityTable>>,
      )
    ) {
      throw new opts.ConflictErrorClass(
        `External id(s) matched an existing ${opts.entityLabelPlural} row (id ${ownerIds[0]}) whose stored data conflicts with the incoming values`,
      );
    }
  }

  let rows: InferSelectModel<TEntityTable>[];
  if (created) {
    const missing = missingRequiredColumns(opts.entityTable, values);
    if (missing.length > 0) {
      throw new MissingRequiredFieldError(
        `Cannot create new ${opts.entityLabelPlural}: missing required field(s): ${missing.join(', ')}`,
      );
    }
    rows = (await handle
      .insert(opts.entityTable)
      .values(values as unknown as InferInsertModel<TEntityTable>)
      .returning()) as InferSelectModel<TEntityTable>[];
  } else if (Object.keys(values).length === 0) {
    // Nothing to write: drizzle rejects `.set({})`, and there is nothing to
    // change anyway. Read the row back so `{ row, created }` is unaffected.
    rows = (await handle
      .select()
      .from(asBaseTable(opts.entityTable))
      .where(
        eq(opts.entityIdColumn, ownerIds[0]),
      )) as InferSelectModel<TEntityTable>[];
  } else {
    rows = (await handle
      .update(opts.entityTable)
      .set(values as unknown as InferInsertModel<TEntityTable>)
      .where(eq(opts.entityIdColumn, ownerIds[0]))
      .returning()) as InferSelectModel<TEntityTable>[];
  }
  const row = rows[0];
  const ownerId = (row as { id: number }).id;

  await insertMissingExternalIds({
    db: handle,
    externalIdTable: opts.externalIdTable,
    existingRows,
    externalIds: opts.externalIds,
    buildRow: (pair) => opts.buildExternalIdRow(ownerId, pair),
  });

  return { row, created };
}

/**
 * The shared preamble of every game-data `upsert()`; callers keep only their
 * divergent tail.
 *
 * The whole sequence runs in one transaction because the entity row and its
 * external-id rows must commit or roll back together — committing the entity
 * alone leaves a row nothing points at, which no later upsert can ever find
 * or reuse.
 *
 * Losing the external-id unique-constraint race is not the caller's problem:
 * the transaction rolls back and the attempt re-runs up to
 * `MAX_UPSERT_ATTEMPTS` times, rethrowing the last violation only if every
 * attempt loses. `created` is `false` on a successful retry.
 *
 * `values` is partial: keys whose value is `undefined` are stripped before the
 * database sees them, so an update never overwrites a column the payload said
 * nothing about, while an explicit `null` still writes `null`.
 */
export async function upsertByExternalIds<
  TEntityTable extends PgTable,
  TExternalIdTable extends PgTable,
>(
  opts: UpsertByExternalIdsOptions<TEntityTable, TExternalIdTable>,
): Promise<{ row: InferSelectModel<TEntityTable>; created: boolean }> {
  const externalIdTableName = getTableName(opts.externalIdTable);

  let lastViolation: unknown;
  for (let attempt = 1; attempt <= MAX_UPSERT_ATTEMPTS; attempt++) {
    try {
      return await opts.db.transaction(
        async (tx) => await runUpsertAttempt(opts, tx),
      );
    } catch (error) {
      if (!isExternalIdUniqueViolation(error, externalIdTableName)) {
        throw error;
      }
      // A concurrent call committed this external id first, so this attempt's
      // entity insert has just been rolled back with the transaction. Retry
      // from the top: the fresh resolve now sees the winner's committed row
      // and takes the update path, reconciling onto it rather than leaving a
      // second, orphaned row behind.
      lastViolation = error;
    }
  }

  throw new Error(
    `Failed to upsert ${opts.entityLabelPlural} after ${MAX_UPSERT_ATTEMPTS} attempts: a concurrent writer kept winning the race on ${externalIdTableName}`,
    { cause: lastViolation },
  );
}
