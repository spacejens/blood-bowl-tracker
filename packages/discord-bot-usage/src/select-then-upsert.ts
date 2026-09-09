import type {
  InferInsertModel,
  PgColumn,
  PgTable,
  SQL,
} from '@blood-bowl-tracker/db';
import { getTableName } from '@blood-bowl-tracker/db';

import type { DbOrTx } from './db-or-tx';

/** Postgres' SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * How many `.cause` links to walk while unwrapping a caught error before
 * giving up. drizzle-orm's pg-core session wraps exactly one level in
 * practice (see below), so 3 is generous headroom rather than a value tuned
 * to a specific stack.
 */
const MAX_CAUSE_UNWRAP_DEPTH = 3;

/**
 * True only for a unique-constraint violation on `tableName` itself — never
 * on its primary key, which would mean a desynced sequence (an
 * infrastructure bug, not the concurrent-insert race this guards against).
 *
 * The caught value never carries the fields to test directly. drizzle-orm
 * wraps every query failure in a `DrizzleQueryError` that sets `cause` but
 * copies neither `code` nor `table_name`, so the `postgres` driver's
 * `PostgresError` is only reachable by walking `.cause` — bounded here
 * defensively. Same shape as `packages/game-data`'s
 * `isExternalIdUniqueViolation`.
 */
function isUniqueViolationOn(error: unknown, tableName: string): boolean {
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

export interface SelectThenUpsertOptions<T extends PgTable> {
  tx: DbOrTx;
  table: T;
  idColumn: PgColumn;
  /** The uniqueness condition identifying the row, e.g. `eq(guilds.discordId, id)`. */
  where: SQL;
  values: InferInsertModel<T>;
}

/**
 * Widens a generic `T extends PgTable` to the concrete `PgTable` base type.
 * `.from()`'s overload resolution can't evaluate the deferred conditional
 * type it uses to reject data-modifying-statement subqueries while the
 * argument is still a naked generic type parameter; passing it through this
 * identity function first resolves the parameter to a concrete `PgTable`,
 * which the overload accepts structurally, no cast required. Same pattern as
 * `packages/game-data`'s `upsertByExternalIds`.
 */
function asBaseTable(table: PgTable): PgTable {
  return table;
}

/**
 * Insert-or-update by a caller-supplied uniqueness condition, never
 * `ON CONFLICT DO UPDATE`. Against a history-tracked table, a conflicting
 * `INSERT ... ON CONFLICT` still fires the `BEFORE INSERT` trigger for the
 * attempted row before Postgres has detected the conflict, and `versioning()`
 * unconditionally records that attempted insert into the `_history` table —
 * leaving an orphaned history row behind on every single call, not just on
 * one whose values happened not to change. Selecting first and issuing a
 * plain `insert` or `update` avoids that path entirely; this is the same
 * shape `packages/game-data`'s `upsertByExternalIds` uses against
 * `game_data`'s own history-tracked tables, simplified for a caller with a
 * single equality condition and no external-id bookkeeping.
 *
 * Generic over the entity table — the "generic over entity/table type"
 * exemption in `CLAUDE.md`'s service-vs-loose-function rules, since it is
 * parameterized by a compile-time table type passed explicitly rather than an
 * injected provider.
 */
export async function selectThenUpsert<T extends PgTable>(
  options: SelectThenUpsertOptions<T>,
): Promise<number> {
  const { tx, table, idColumn, where, values } = options;
  const [existing] = await tx
    .select({ id: idColumn })
    .from(asBaseTable(table))
    .where(where)
    .limit(1);
  if (existing) {
    await tx.update(table).set(values).where(where);
    return existing.id as number;
  }
  try {
    // Wrapped in a savepoint (drizzle's nested `.transaction()` against
    // postgres-js): a failed statement otherwise poisons the whole
    // enclosing transaction in PostgreSQL, which would also fail the
    // re-select below.
    return await tx.transaction(async (savepoint) => {
      const [inserted] = await savepoint
        .insert(table)
        .values(values)
        .returning({ id: idColumn });
      return inserted.id as number;
    });
  } catch (error) {
    // Recover only from the specific race this guards against: a concurrent
    // caller inserted the same row between our select and insert, and the
    // unique constraint on this table rejected ours. Any other failure (a
    // different constraint, a connection drop, ...) rethrows immediately —
    // re-selecting and returning whatever row happens to match `where`
    // would silently hide a real, unrelated failure behind an apparently
    // successful call.
    if (!isUniqueViolationOn(error, getTableName(table))) {
      throw error;
    }
    const [raced] = await tx
      .select({ id: idColumn })
      .from(asBaseTable(table))
      .where(where)
      .limit(1);
    if (raced) {
      return raced.id as number;
    }
    throw error;
  }
}
