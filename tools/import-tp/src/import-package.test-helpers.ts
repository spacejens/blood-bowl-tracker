import {
  ImportResultService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
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

/**
 * A `MockProxy<NameExternalIdService>` whose seven `forX(name)` methods return
 * the name they were given. Those are pure identity passthroughs with nothing
 * computed or formatted, so there is no algorithm to drift out of sync with
 * the real NameExternalIdService (see
 * `packages/import/src/name-external-id.service.ts`) — they are exempt from
 * the canned-response rule. `forPosition`, which concatenates a
 * `"raceName: positionName"` template, is deliberately *not* stubbed here:
 * the one spec that needs it cans a value per test.
 */
export function mockNameExternalIdService(): MockProxy<NameExternalIdService> {
  const nameExternalId = mock<NameExternalIdService>();
  nameExternalId.forCoach.mockImplementation((name) => name);
  nameExternalId.forEra.mockImplementation((name) => name);
  nameExternalId.forLeague.mockImplementation((name) => name);
  nameExternalId.forRulesSet.mockImplementation((name) => name);
  nameExternalId.forTeam.mockImplementation((name) => name);
  nameExternalId.forRace.mockImplementation((name) => name);
  nameExternalId.forStarPosition.mockImplementation((name) => name);
  return nameExternalId;
}

/**
 * Realigns a `vi.fn()` test double's static type to the exact function
 * signature a `MockProxy` method's `mockImplementation()` requires.
 *
 * `vi.fn()` called without an explicit generic parameter produces a
 * `Mock<Constructable | Procedure>`, whose intersection-typed call/construct
 * signatures are not structurally assignable to *any* concrete function
 * type (not even a generic `(...args: never[]) => unknown`) — TypeScript
 * needs an explicit escape hatch here, not a narrower structural type. Every
 * spec's `vi.fn()` double is still fully configured via
 * `mockResolvedValue`/`mockImplementation` at its own call site and behaves
 * correctly at runtime; this only realigns its *static* type, narrowly and
 * in one documented place, instead of scattering a bare `as X` cast through
 * each spec.
 */
export function asProviderMethod<F>(fn: unknown): F {
  return fn as F;
}
