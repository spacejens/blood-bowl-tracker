import type { Db } from '@blood-bowl-tracker/db';
import { count } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Shared count query used by every game-data service's `countAll()`. Kept
 * internal to this package (not re-exported from index.ts): it removes the
 * duplicated `select({ count: count() }).from(table)` boilerplate without
 * introducing a repository layer.
 */
export async function countRows(db: Db, table: PgTable): Promise<number> {
  const [row] = await db.select({ count: count() }).from(table);
  return row.count;
}
