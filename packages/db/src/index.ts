export { AdvisoryLockModule } from './advisory-lock.module';
export { AdvisoryLockService } from './advisory-lock.service';
export type { Db } from './db';
export { createDb } from './db';
export type { DbModuleAsyncOptions } from './db.module';
export { DATABASE_URL, DB, DbModule } from './db.module';
export * from './schema';

/**
 * drizzle-orm's query-building surface, re-exported so every other workspace
 * can build queries against an injected `Db` without depending on drizzle-orm
 * itself. `packages/db` is the single place the pre-release driver is pinned;
 * `dependency-boundary.spec.ts` enforces that.
 *
 * `SQL` is re-exported type-only: production code only ever annotates with it.
 * Its value form (for `is(x, SQL)`) lives in the `/test-helpers` subpath,
 * which is where the test-only drizzle symbols are kept.
 */
export type { InferInsertModel, InferSelectModel, SQL } from 'drizzle-orm';
export {
  and,
  asc,
  between,
  count,
  countDistinct,
  desc,
  eq,
  exists,
  getColumnTable,
  getTableColumns,
  getTableName,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  min,
  ne,
  or,
  sql,
  sum,
} from 'drizzle-orm';
export type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
export { alias } from 'drizzle-orm/pg-core';
