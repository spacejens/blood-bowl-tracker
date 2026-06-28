import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export function createDb(url: string) {
  const client = postgres(url);
  return drizzle({ client });
}

export type Db = ReturnType<typeof createDb>;
