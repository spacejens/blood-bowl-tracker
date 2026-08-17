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
 * True only for the specific violation a lost external-id race raises: a
 * unique-constraint violation (SQLSTATE 23505) on the entity's own
 * external-id join table.
 *
 * Two things make this harder than it looks:
 *
 * 1. **The real driver error is never the caught value.** drizzle-orm
 *    1.0.0-rc.4's pg-core session wraps every query failure in a
 *    `DrizzleQueryError(sql, params, e)`
 *    (`drizzle-orm/pg-core/async/session.js`), which sets `this.cause = e`
 *    but does not copy `code`/`table_name` onto itself
 *    (`drizzle-orm/errors.js`). The `postgres` driver's `PostgresError` —
 *    which does carry those fields — is only reachable via `.cause` on the
 *    caught error. So the caught value's own `code`/`table_name` are always
 *    undefined in production; this walks `.cause` (bounded, defensively) to
 *    find the object that actually carries them.
 * 2. **Matching by constraint name is fragile.** The constraint's name is
 *    `<table>_external_system_id_external_id_unique`, but Postgres truncates
 *    any identifier to 63 bytes (`NAMEDATALEN`) at creation time. For
 *    `competition_groups_external_ids` that name is 69 bytes, so the stored
 *    (and driver-reported) constraint name is silently truncated and would
 *    never match a hand-reconstructed full name. Every entity's join table
 *    (`packages/db/src/schema/external-ids-table.ts`) carries exactly one
 *    unique constraint besides its primary key — the one on
 *    `(external_system_id, external_id)` — so matching by `table_name`
 *    alone unambiguously identifies "this is the race this code is designed
 *    to catch", and is immune to truncation or any future rename of the
 *    constraint itself.
 *
 * The SQLSTATE check is kept alongside the table-name check deliberately: a
 * bare table-name match would retry on that table's *other* future
 * constraints too (e.g. a NOT NULL violation), hiding a real bug behind
 * three attempts and a confusing final error. The same reasoning excludes the
 * table's primary key: a 23505 on `<table>_pkey` (e.g. a desynced `serial`
 * sequence after a restore that didn't reset it) is a real infrastructure bug,
 * not the external-id race this code retries, and must not be silently
 * retried three times and then misreported as "a concurrent writer kept
 * winning the race." `constraint_name` is not affected by the truncation
 * problem the constraint-name approach was rejected for above: `<table>_pkey`
 * is always well under 63 bytes, so a plain equality check is safe here even
 * though it wasn't safe for the full unique-constraint name.
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
 * The resolve -> conflict-guard -> insert-or-update -> insert-missing-external-ids
 * preamble shared by every game-data upsert(). Callers keep only their
 * genuinely-divergent tail (join-table syncs, return shape) and pass the
 * one-per-entity pieces (conflict class, label, column wiring, buildRow) in.
 *
 * The whole sequence runs in one transaction. The entity row and its
 * external-id row(s) must commit or roll back together: committing the entity
 * row on its own and only then failing to insert the external-id row leaves an
 * entity nothing points at, which no later upsert can ever find and reuse.
 *
 * Losing the race on the external-id unique constraint is not an error the
 * caller should see: the transaction rolls back and the whole attempt is
 * re-run, up to MAX_UPSERT_ATTEMPTS times. Only if every attempt loses is the
 * last violation rethrown, as the `cause` of a descriptive error, rather than
 * being retried forever or silently swallowed. `created` on a successful
 * retry is `false`, correctly reporting that this call did not create the row.
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
