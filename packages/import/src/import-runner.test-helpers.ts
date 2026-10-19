import type { MockProxy } from 'vitest-mock-extended';

import type {
  ImportRunnerService,
  RecordUpsertOptions,
  RecordUpsertResultOptions,
} from './import-runner.service';

/**
 * The options the service under test passed to the mocked
 * `ImportRunnerService.recordUpsert` on its `call`-th call (0-based).
 *
 * A plain accessor over the mock's recorded calls. Specs stub the runner with
 * a canned return value and assert on what the service handed it, invoking the
 * captured `upsert` / `buildErrorMessage` callbacks directly where they care
 * what those do. The runner's own try/catch and error recording is covered by
 * `import-runner.service.spec.ts`.
 */
export function recordUpsertOptions(
  runner: MockProxy<ImportRunnerService>,
  call = 0,
): RecordUpsertOptions {
  return runner.recordUpsert.mock.calls[call][0];
}

/** As `recordUpsertOptions`, for `ImportRunnerService.recordUpsertResult`. */
export function recordUpsertResultOptions(
  runner: MockProxy<ImportRunnerService>,
  call = 0,
): RecordUpsertResultOptions<unknown> {
  return runner.recordUpsertResult.mock.calls[call][0];
}
