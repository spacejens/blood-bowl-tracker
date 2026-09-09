import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import type { Db } from '../db.js';
import { createDb } from '../db.js';

/**
 * `sql` template literals built in this file are typed against the ESM
 * conditional-export instantiation of drizzle-orm (this directory's sibling
 * `package.json` sets `"type": "module"`, per `drizzle.test-helpers.ts`),
 * while `Db['execute']` (from `../db.js`, which resolves under the package's
 * default CommonJS condition) expects the CJS instantiation. The two are the
 * same runtime module loaded via different conditional-export entry points,
 * so this cast is safe — it exists only to bridge TypeScript's structural
 * mismatch between the two instantiations, not a real type difference.
 */
function asExecuteArg(query: SQL): Parameters<Db['execute']>[0] {
  return query as unknown as Parameters<Db['execute']>[0];
}

/**
 * Real-Postgres integration test helpers: an ephemeral, migrated database for
 * `*.e2e-spec.ts` suites that need behavior a mocked db cannot express —
 * history-versioning triggers, deferred constraints, and the actual error
 * shapes the `postgres` driver raises.
 *
 * A container per test run, on a random host port, deliberately instead of
 * docker-compose's `postgres` service: that service has a fixed
 * `container_name`, so only one git worktree can hold it at a time, and
 * parallel `develop-feature` sessions would collide on it.
 *
 * Reached through `@blood-bowl-tracker/db/test-helpers`, like `mockDb`.
 * Test-only; excluded from coverage by `vitest.config.ts`.
 */

/** Matches docker-compose's `postgres` service, so tests run the same major version. */
const POSTGRES_IMAGE = 'postgres:18-alpine';

export interface TestPostgresContainer {
  /** Connection URL of the started, empty (not yet migrated) database. */
  url: string;
  /** Stops and removes the container. Safe to call once, at teardown. */
  stop: () => Promise<void>;
}

/**
 * Start an ephemeral Postgres and hand back its connection URL.
 *
 * `@testcontainers/postgresql` is imported dynamically rather than at module
 * scope on purpose: this file is re-exported through
 * `db-mock.test-helpers.ts`, which every `mockDb`-using unit spec in the repo
 * imports. A static import would drag testcontainers into all of them, for a
 * dependency only an e2e global setup ever needs.
 */
export async function startTestPostgresContainer(): Promise<TestPostgresContainer> {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  try {
    const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    return {
      url: container.getConnectionUri(),
      stop: async () => {
        await container.stop();
      },
    };
  } catch (error) {
    throw new Error(
      'Failed to start the ephemeral test Postgres container. Is Docker ' +
        'running? See README.md for the Docker requirement for ' +
        "packages/game-data's tests.",
      { cause: error },
    );
  }
}

/**
 * Connect to `url` and apply every migration. A thin wrapper over `createDb`,
 * which already runs drizzle's migrator; it exists so e2e callers never have
 * to know that, and so the "migrated test database" concept has one name.
 * Idempotent — drizzle's migration tracking table makes a second call a no-op.
 */
export async function getMigratedTestDb(url: string): Promise<Db> {
  return await createDb(url);
}

/**
 * Close the underlying `postgres` client. Required in an `afterAll`: the
 * driver holds an open connection that would otherwise keep the Vitest worker
 * alive after the suite finishes.
 */
export async function closeTestDb(db: Db): Promise<void> {
  await db.$client.end();
}

/**
 * Empty every table in the `game_data` schema, resetting each serial sequence,
 * so one e2e test's rows can never leak into the next.
 *
 * The table list is read from the Postgres catalog rather than hand-maintained
 * so it cannot go stale as the schema grows; history tables are picked up
 * automatically for the same reason. `CASCADE` is what lets the tables be
 * truncated in one statement despite their foreign keys, including the
 * history tables' deferred keys back to their parents. drizzle's own
 * `drizzle.__drizzle_migrations` lives in a different schema and is left
 * alone, so the database stays migrated.
 */
export async function resetGameDataTables(db: Db): Promise<void> {
  const rows = (await db.execute(
    asExecuteArg(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'game_data'`,
    ),
  )) as unknown as { tablename: string }[];

  const tables = [...rows].map(
    (row) => `"game_data"."${row.tablename.replaceAll('"', '""')}"`,
  );
  if (tables.length === 0) {
    return;
  }

  await db.execute(
    asExecuteArg(
      sql.raw(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`),
    ),
  );
}
