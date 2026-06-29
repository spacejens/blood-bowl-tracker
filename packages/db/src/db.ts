import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { join } from 'node:path';

export async function createDb(url: string) {
  const client = postgres(url);
  const db = drizzle({ client });
  console.log('[db] Running migrations...');
  await migrate(db, { migrationsFolder: join(__dirname, '../migrations') });
  console.log('[db] Migrations complete.');
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;
