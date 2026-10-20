import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Widens a generic `T extends PgTable` to the concrete `PgTable` base type.
 * `.from()`'s overload resolution can't evaluate the deferred conditional
 * type it uses to reject data-modifying-statement subqueries while the
 * argument is still a naked generic type parameter. Passing the table
 * through this identity function first resolves the parameter to a concrete
 * `PgTable`, which the overload accepts structurally, so no cast is needed.
 */
export function asBaseTable(table: PgTable): PgTable {
  return table;
}
