import type { Db } from '@blood-bowl-tracker/db';

/**
 * Either the real `Db` or the transaction handle `db.transaction()` hands its
 * callback. The two are structurally compatible for the insert chains built
 * here but are not the same nominal type, so anything that must accept both
 * takes this union.
 *
 * Derived from `Db['transaction']` rather than importing drizzle's
 * `PgTransaction` and restating its schema type parameters — and because only
 * `packages/db` may depend on drizzle-orm directly.
 */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
