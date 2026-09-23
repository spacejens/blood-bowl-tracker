import {
  ImportResultService,
  NameExternalIdService,
  ReferenceLookupService,
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
 * `"raceName: positionName"` template, is deliberately *not* stubbed here.
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
 * `vi.fn()` without an explicit generic produces a type not structurally
 * assignable to any concrete function type, so TypeScript needs this one
 * documented escape hatch instead of a bare `as X` in each spec.
 */
export function asProviderMethod<F>(fn: unknown): F {
  return fn as F;
}

/**
 * Stubs a mocked `ReferenceLookupService`'s `keyOf` with a made-up key
 * format that is deliberately *unlike* the real one. Nothing asserts on the
 * literal value: the key is only an internal correlation id between this
 * stub and whichever `lookupMap` stub the same test configures. Keeping the
 * format visibly different from production's guarantees no test can quietly
 * depend on the real derivation -- every test must build its expected keys
 * by calling `lookup.keyOf({ ... })`, never by writing a key out by hand.
 */
export function mockKeyOf(lookup: MockProxy<ReferenceLookupService>): void {
  lookup.keyOf.mockImplementation(
    (ref) => `${ref.externalId}::${ref.externalSystemId}`,
  );
}

/**
 * A `MockProxy<ReferenceLookupService>` whose `keyOf` is stubbed by
 * `mockKeyOf` (a made-up, non-production key format used purely as a
 * correlation id with the `lookupMap` stub below) and whose
 * `lookupMap(kind, ...)` resolves from a plain external-id -> DB-id map per
 * kind, keyed under `tpSystemId`. `era` always comes from `eraIdsByName`;
 * `race`/`coach`/`position`/`competition`/`rulesSet` come from `extra`'s
 * matching map when supplied. A kind with no map (or an id the map doesn't
 * declare) resolves to nothing, matching a real unresolved reference.
 *
 * Limitation: the returned `lookupMap` stub ignores its `refs` argument
 * entirely and always answers every entry declared for the requested
 * `kind` — so a service that requests the *wrong* references still gets ids
 * back here. Only an explicit
 * `expect(lookup.lookupMap).toHaveBeenCalledWith(...)` assertion in the
 * test itself catches that class of bug; add one when the request shape
 * matters to what's being tested.
 */
export function mockReferenceLookupService(
  eraIdsByName: Map<string, number>,
  tpSystemId: number,
  extra?: {
    raceIdsByCode?: Map<string, number>;
    coachIdsByTpId?: Map<string, number>;
    positionIdsByExternalId?: Map<string, number>;
    competitionIdsByExternalId?: Map<string, number>;
    rulesSetIdsByName?: Map<string, number>;
  },
): MockProxy<ReferenceLookupService> {
  const lookup = mock<ReferenceLookupService>();
  mockKeyOf(lookup);
  const idsByExternalIdByKind: Record<string, Map<string, number>> = {
    era: eraIdsByName,
    race: extra?.raceIdsByCode ?? new Map<string, number>(),
    coach: extra?.coachIdsByTpId ?? new Map<string, number>(),
    position: extra?.positionIdsByExternalId ?? new Map<string, number>(),
    competition: extra?.competitionIdsByExternalId ?? new Map<string, number>(),
    rulesSet: extra?.rulesSetIdsByName ?? new Map<string, number>(),
  };
  lookup.lookupMap.mockImplementation((kind) => {
    const idsByExternalId =
      idsByExternalIdByKind[kind] ?? new Map<string, number>();
    const map = new Map<string, number>();
    for (const [externalId, id] of idsByExternalId) {
      map.set(lookup.keyOf({ externalSystemId: tpSystemId, externalId }), id);
    }
    return Promise.resolve(map);
  });
  return lookup;
}
