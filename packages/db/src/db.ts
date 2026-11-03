import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const migrationsFolder = join(__dirname, '../migrations');

/**
 * Advisory lock key that serializes startup migrations across machines. It
 * differs from the leader-election key in AdvisoryLockService (4242/1) so the
 * two never block each other.
 */
const MIGRATION_LOCK_CLASS_ID = 4242;
const MIGRATION_LOCK_OBJECT_ID = 2;

async function logPendingMigrations(
  db: ReturnType<typeof drizzle>,
  log: (msg: string) => void,
) {
  const local = readdirSync(migrationsFolder)
    .filter((name) => existsSync(join(migrationsFolder, name, 'migration.sql')))
    .sort();

  const applied = new Set<string>();
  try {
    const rows = await db.execute(
      sql`SELECT name FROM drizzle.__drizzle_migrations WHERE name IS NOT NULL`,
    );
    for (const row of rows as Array<Record<string, unknown>>) {
      if (typeof row.name === 'string') applied.add(row.name);
    }
  } catch {
    // Tracking table does not exist yet on a fresh database — all migrations are pending.
  }

  for (const name of local.filter((n) => !applied.has(n))) {
    log(`Applying: ${name}`);
  }
}

/**
 * Runs `run` while holding the migration advisory lock, so machines that
 * start together migrate one at a time. drizzle's `migrate()` reads the
 * applied-migrations list before its transaction and takes no lock of its
 * own, so without this two machines can both apply and record the same
 * pending migration. A machine that waits here reads that list only after
 * the holder has committed, and finds nothing left to apply.
 *
 * The lock is session-scoped, so it lives on its own single-connection client
 * (`max: 1`) rather than drizzle's pool, which could unlock on a different
 * connection. Closing that client ends the session, which releases the lock
 * even if the explicit unlock failed; a crash or lost connection releases it
 * the same way. An unlock failure is therefore ignored, so it never masks the
 * migration's own outcome.
 */
async function withMigrationLock<T>(
  url: string,
  run: () => Promise<T>,
): Promise<T> {
  const lockClient = postgres(url, { max: 1 });
  try {
    await lockClient`SELECT pg_advisory_lock(${MIGRATION_LOCK_CLASS_ID}, ${MIGRATION_LOCK_OBJECT_ID})`;
    try {
      return await run();
    } finally {
      await lockClient`SELECT pg_advisory_unlock(${MIGRATION_LOCK_CLASS_ID}, ${MIGRATION_LOCK_OBJECT_ID})`.catch(
        () => undefined,
      );
    }
  } finally {
    await lockClient.end();
  }
}

export async function createDb(url: string, log?: (msg: string) => void) {
  const client = postgres(url);
  const db = drizzle({ client });
  await withMigrationLock(url, async () => {
    if (log) await logPendingMigrations(db, log);
    await migrate(db, { migrationsFolder });
  });
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;
