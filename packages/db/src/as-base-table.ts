import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Widens a generic `T extends PgTable` to the concrete `PgTable` base type.
 * drizzle cannot type-check some builder calls while the table is still a
 * naked generic type parameter:
 * - `.from()`'s overload resolution can't evaluate the deferred conditional
 *   type it uses to reject data-modifying-statement subqueries.
 * - `.insert(table).values(...)` takes a key-remapped mapped type over the
 *   table's insert model, which a generic `InferInsertModel<T>` is not
 *   assignable to.
 * Passing the table through this identity function first resolves the
 * parameter to a concrete `PgTable`, which both calls accept structurally, so
 * no cast is needed.
 */
export function asBaseTable(table: PgTable): PgTable {
  return table;
}
