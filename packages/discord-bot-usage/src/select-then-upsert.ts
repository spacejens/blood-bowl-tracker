import type {
  InferInsertModel,
  PgColumn,
  PgTable,
  SQL,
} from '@blood-bowl-tracker/db';

import type { DbOrTx } from './db-or-tx';

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
    // A concurrent caller inserted the same row between our select and
    // insert, and the unique constraint rejected ours. Re-read the winner's
    // row rather than dropping the whole call — plausible in practice (two
    // users interacting in the same new guild or channel at once). If no
    // row appears, this was some other failure: rethrow the original error.
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
