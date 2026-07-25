import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from './database-timeout.service';

/**
 * Test-only helpers for `DatabaseTimeoutService` consumers.
 * Do not import from production code.
 */

/**
 * A `DatabaseTimeoutService` mock whose `run` mirrors the real `run`'s happy
 * path: resolve with `work`, ignore `fallback`/`timeoutMs`. Individual tests
 * that need the timeout branch override this per-call with
 * `stubDatabaseTimeoutOnce` (or `stubDatabaseTimeout` for every call).
 */
export function mockDatabaseTimeout(): MockProxy<DatabaseTimeoutService> {
  const databaseTimeout = mock<DatabaseTimeoutService>();
  databaseTimeout.run.mockImplementation(async (work) => work);
  return databaseTimeout;
}

/**
 * Make the next `run()` call "time out": resolve with the caller's own
 * `fallback` argument, exactly like the real `run` does when its race is won
 * by the timeout. Faithful to the real contract rather than hardcoding a
 * sentinel, so a test also verifies the consumer passed the right fallback.
 */
export function stubDatabaseTimeoutOnce(
  databaseTimeout: MockProxy<DatabaseTimeoutService>,
): void {
  databaseTimeout.run.mockImplementationOnce(
    async (_work, fallback) => fallback,
  );
}

/**
 * Make every subsequent `run()` call "time out": resolve with the caller's
 * own `fallback` argument. Used when a test never expects the pass-through
 * path to run again for the rest of the case.
 */
export function stubDatabaseTimeout(
  databaseTimeout: MockProxy<DatabaseTimeoutService>,
): void {
  databaseTimeout.run.mockImplementation(async (_work, fallback) => fallback);
}
