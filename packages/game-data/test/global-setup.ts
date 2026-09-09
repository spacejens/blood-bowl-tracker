/// <reference types="node" />
// See the matching comment in `./e2e-database.ts`: this file is parsed under
// ESLint's synthetic default project too, so `process` needs this reference
// to type as more than `error`.
import type { TestPostgresContainer } from '@blood-bowl-tracker/db/test-helpers';
import {
  closeTestDb,
  getMigratedTestDb,
  startTestPostgresContainer,
} from '@blood-bowl-tracker/db/test-helpers';

import { TEST_DATABASE_URL_ENV } from './e2e-database';

/**
 * Vitest globalSetup for the e2e suite: one ephemeral Postgres per run,
 * migrated once here rather than per spec file, with its URL published
 * through the environment. Module state is safe to hold across `setup` and
 * `teardown` — Vitest imports this module once, in the main process.
 */
let container: TestPostgresContainer | undefined;

export async function setup(): Promise<void> {
  container = await startTestPostgresContainer();
  try {
    const db = await getMigratedTestDb(container.url);
    await closeTestDb(db);
  } catch (error) {
    // Best-effort cleanup: a failure here must never replace the migration
    // error above, which is the one a developer actually needs to see.
    await container.stop().catch(() => undefined);
    container = undefined;
    throw error;
  }
  process.env[TEST_DATABASE_URL_ENV] = container.url;
}

export async function teardown(): Promise<void> {
  delete process.env[TEST_DATABASE_URL_ENV];
  await container?.stop();
  container = undefined;
}
