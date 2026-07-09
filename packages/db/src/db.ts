import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const migrationsFolder = join(__dirname, '../migrations');

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

export async function createDb(url: string, log?: (msg: string) => void) {
  const client = postgres(url);
  const db = drizzle({ client });
  if (log) await logPendingMigrations(db, log);
  await migrate(db, { migrationsFolder });
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;
