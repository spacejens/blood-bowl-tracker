import { ImportResultService } from '@blood-bowl-tracker/import';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

/**
 * A `MockProxy<ImportResultService>` whose `error` returns the item/message it
 * was given. That method is a pure identity field copy with no branching or
 * formatting, so there is no algorithm here that can drift out of sync with
 * the real ImportResultService (see
 * `packages/import/src/import-result.service.ts`) — it is exempt from the
 * canned-response rule. `result`, which derives `success`, is deliberately
 * *not* stubbed here: each spec cans its own ImportResult and asserts what it
 * passed to `result`.
 */
export function mockImportResultService(): MockProxy<ImportResultService> {
  const importResults = mock<ImportResultService>();
  importResults.error.mockImplementation(({ item, message }) => ({
    item,
    message,
  }));
  return importResults;
}
