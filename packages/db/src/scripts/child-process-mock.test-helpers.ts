import type { execFileSync } from 'node:child_process';

import type { Mock } from 'vitest';
import { vi } from 'vitest';

/**
 * Test-only helper. Do not import from production code.
 *
 * `DbGenerateService` runs `drizzle-kit` through `node:child_process`'s
 * `execFileSync`, so its spec replaces the module:
 *
 * ```ts
 * vi.mock('node:child_process', async () =>
 *   (await import('./child-process-mock.test-helpers.js')).childProcessModuleMock(),
 * );
 * ```
 *
 * The mocked `execFileSync` delegates to the set most recently built by
 * `installChildProcessMocks()`, which the spec calls in its `beforeEach`, so
 * every test gets a brand new, inert `vi.fn()` with no implementation left
 * over from an earlier test. The spec also calls `resetChildProcessMocks()`
 * in its `afterEach`, so a spec that forgets to install fails loudly instead
 * of reusing the previous test's mock.
 *
 * Only a type is imported from `node:child_process`: this module is loaded
 * from inside the module mock's factory.
 */

export interface ChildProcessMocks {
  execFileSync: Mock<typeof execFileSync>;
}

let installed: ChildProcessMocks | undefined;

function current(): ChildProcessMocks {
  if (installed === undefined) {
    throw new Error(
      'installChildProcessMocks() must run before execFileSync is called',
    );
  }
  return installed;
}

/** Builds a fresh mock set and makes it the one the mocked module uses. */
export function installChildProcessMocks(): ChildProcessMocks {
  installed = { execFileSync: vi.fn<typeof execFileSync>() };
  return installed;
}

/** Discards the current set, so the mocked module throws until reinstalled. */
export function resetChildProcessMocks(): void {
  installed = undefined;
}

/** The replacement `node:child_process` module, for a spec's `vi.mock` factory. */
export function childProcessModuleMock(): Record<string, unknown> {
  return {
    execFileSync: (
      ...args: Parameters<typeof execFileSync>
    ): ReturnType<typeof execFileSync> => current().execFileSync(...args),
  };
}
