import type { Sql } from 'postgres';
import postgres from 'postgres';

/**
 * The advisory lock's own postgres.js client, deliberately separate from
 * drizzle's pooled one: advisory locks are session-scoped, so the acquire and
 * the release must run on the same physical connection (see
 * AdvisoryLockService). `max: 1` because exactly one reserved connection is
 * ever needed.
 */
export function createLockClient(url: string): Sql {
  return postgres(url, { max: 1 });
}
