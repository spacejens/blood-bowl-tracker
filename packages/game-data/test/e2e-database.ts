/// <reference types="node" />
import type { Db } from '@blood-bowl-tracker/db';
import { getMigratedTestDb } from '@blood-bowl-tracker/db/test-helpers';

/**
 * The triple-slash reference above is required because `test/*.ts` is parsed
 * under ESLint's synthetic "default project" (`eslint.config.ts`'s
 * `allowDefaultProject`, since `tsconfig.json`'s `"include": ["src"]`
 * deliberately excludes `test/` — see `CLAUDE.md`'s "Context the implementer
 * needs" for this task). That default project carries no `@types/node`, so
 * `process` would otherwise type as `error` and trip
 * `@typescript-eslint/no-unsafe-*` below.
 */

/**
 * Environment variable through which `global-setup.ts` publishes the e2e
 * container's connection URL to every e2e spec file. Vitest's global setup
 * runs before any worker is spawned, so workers inherit it.
 */
export const TEST_DATABASE_URL_ENV = 'TEST_DATABASE_URL';

/** The e2e container's URL, or a loud failure if the global setup did not run. */
export function testDatabaseUrl(): string {
  const url = process.env[TEST_DATABASE_URL_ENV];
  if (url === undefined || url === '') {
    throw new Error(
      `${TEST_DATABASE_URL_ENV} is not set. E2E specs must be run through ` +
        'vitest.e2e.config.ts, whose globalSetup starts the container.',
    );
  }
  return url;
}

/**
 * One connection per spec file. The migrations were already applied by the
 * global setup; `getMigratedTestDb` re-checks them, which drizzle's tracking
 * table makes a no-op. Pair every call with `closeTestDb` in `afterAll`.
 */
export async function connectTestDb(): Promise<Db> {
  return await getMigratedTestDb(testDatabaseUrl());
}
