/**
 * Test-only drizzle-orm re-exports.
 *
 * `packages/db` is the only workspace that may depend on drizzle-orm (see
 * `dependency-boundary.spec.ts`), so specs elsewhere reach these through
 * `@blood-bowl-tracker/db/test-helpers`:
 *
 * - `PgDialect` renders a captured `SQL` condition to real SQL text plus
 *   params, so a spec can assert on the generated query.
 * - `drizzle` is exposed purely for its `.mock()` builder — a query builder
 *   with no connection behind it. Never used to open a live connection.
 * - `is`, `SQL`, `Column`, `Param`, `StringChunk` are the primitives a spec
 *   needs to walk a captured condition tree and recover the filter values or
 *   join columns a service passed to `.where()` / `.innerJoin()`.
 * - `DrizzleQueryError` is constructed directly by specs that need to shape a
 *   real query-failure error the way a live session would throw it; no
 *   production code in any consumer constructs or imports it.
 *
 * `is()` (rather than `instanceof`) matters: tables imported from this
 * package's CommonJS main entry point are constructed against a different
 * physical copy of drizzle's classes than this ESM `test-helpers/` build, so
 * `instanceof` silently fails to match. `is()` instead compares a
 * `Symbol.for('drizzle:entityKind')` tag, which is shared across module
 * instances through Node's global symbol registry.
 */
export {
  Column,
  DrizzleQueryError,
  is,
  Param,
  SQL,
  StringChunk,
} from 'drizzle-orm';
export { PgDialect } from 'drizzle-orm/pg-core';
export { drizzle } from 'drizzle-orm/postgres-js';
