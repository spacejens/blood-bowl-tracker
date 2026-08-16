import type { Db } from '@blood-bowl-tracker/db';

/**
 * A handle that can issue the queries this package's shared upsert helpers
 * make: either the real `Db`, or the transaction handle `db.transaction()`
 * hands its callback. The two are structurally compatible for the
 * `.select()` / `.insert()` / `.update()` chains these helpers build, but they
 * are not the same nominal TypeScript type, so any helper that must run both
 * inside and outside a transaction takes this union instead of `Db`.
 *
 * Derived from `Db['transaction']` rather than importing drizzle's
 * `PgTransaction` and restating its four schema type parameters, so it stays
 * correct if the driver or those parameters ever change.
 */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
