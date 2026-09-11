/// <reference types="node" />
import type { Db } from '@blood-bowl-tracker/db';
import { getMigratedTestDb } from '@blood-bowl-tracker/db/test-helpers';

/**
 * The triple-slash reference above is required because ESLint still parses
 * `test/*.ts` files under its synthetic "default project"
 * (`eslint.config.ts`'s `allowDefaultProject`) rather than
 * `tsconfig.test.json` — ESLint's typed linting is driven by its own project
 * config, not by whichever `tsconfig` a separate `tsc` invocation happens to
 * use for typechecking, and `tsconfig.test.json` exists only to widen `tsc
 * --noEmit`'s `include`, not to change what ESLint parses against. That
 * default project carries no `@types/node`, so `process` would otherwise
 * type as `error` and trip `@typescript-eslint/no-unsafe-*` below.
 */

/**
 * Environment variable through which `global-setup.ts` publishes the e2e
 * container's connection URL to every e2e spec file. Vitest's global setup
 * runs before any worker is spawned, so workers inherit it.
 */
export const TEST_DATABASE_URL_ENV = 'TEST_DATABASE_URL';

/** The e2e container's URL, or a loud failure if the global setup did not run. */
function testDatabaseUrl(): string {
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
