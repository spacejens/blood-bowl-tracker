import type {
  DbOrTx,
  InferInsertModel,
  PgColumn,
  PgTable,
  SQL,
} from '@blood-bowl-tracker/db';
import {
  asBaseTable,
  getTableName,
  isUniqueViolationOn,
} from '@blood-bowl-tracker/db';

export interface SelectThenUpsertOptions<T extends PgTable> {
  tx: DbOrTx;
  table: T;
  idColumn: PgColumn;
  /** The uniqueness condition identifying the row, e.g. `eq(guilds.discordId, id)`. */
  where: SQL;
  values: InferInsertModel<T>;
}

/**
 * Insert-or-update by a caller-supplied uniqueness condition, never
 * `INSERT ... ON CONFLICT` (neither `DO UPDATE` nor `DO NOTHING`). Against a
 * history-tracked table, `versioning()` is a `BEFORE INSERT` trigger that
 * records the attempted row in the `_history` table before Postgres has
 * detected the conflict. On a conflicting row that history row then violates
 * a history-table constraint — the deferred foreign key to the tracked table
 * at commit, or the `(id, history_version)` primary key when an existing id
 * is reused — so the enclosing transaction can never commit a conflicting
 * row this way. Selecting first and issuing a plain `insert`
 * or `update` avoids that path entirely; this is the same
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
      // asBaseTable: `.values()` cannot type-check against a still-generic
      // table; see asBaseTable's doc comment.
      const [inserted] = await savepoint
        .insert(asBaseTable(table))
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
