import type { MockProxy } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';

/**
 * Wires a mocked `ImportRunnerService` to mirror the real
 * `recordUpsert`/`recordUpsertResult` implementations (see
 * `import-runner.service.ts`), so specs that mock the runner still exercise
 * the caller's error-message/upsert-argument behaviour instead of asserting
 * against opaque mock return values.
 */
export function stubImportRunner(runner: MockProxy<ImportRunnerService>): void {
  runner.recordUpsert.mockImplementation(
    async ({ upsert, item, errors, buildErrorMessage }) => {
      try {
        await upsert();
        return true;
      } catch (err) {
        errors.push({ item, message: buildErrorMessage(err) });
        return false;
      }
    },
  );
  runner.recordUpsertResult.mockImplementation(
    async ({ upsert, item, errors, buildErrorMessage }) => {
      try {
        return await upsert();
      } catch (err) {
        errors.push({ item, message: buildErrorMessage(err) });
        return undefined;
      }
    },
  );
}
