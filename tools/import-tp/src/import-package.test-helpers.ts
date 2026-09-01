import {
  ImportResultService,
  NameExternalIdService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { EraDataConfig } from './eras/era-data-config.service';
import { EraDataConfigService } from './eras/era-data-config.service';

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
 * A `MockProxy<EraDataConfigService>` whose `getEras()` returns one dummy
 * `EraDataConfig` entry per name (only `name` matters to the services under
 * test here -- they enumerate era *names* to build the reference-lookup
 * batch; the other fields are never read). Consumed alongside
 * `mockReferenceLookupService` below.
 */
export function mockEraDataConfigService(
  names: string[],
  rulesSetsByEraName?: Map<string, string[]>,
): MockProxy<EraDataConfigService> {
  const eraDataConfig = mock<EraDataConfigService>();
  const eras: EraDataConfig[] = names.map((name) => ({
    name,
    dataSubdir: name,
    rulesSets: rulesSetsByEraName?.get(name) ?? ['BB2020'],
    startDate: '2020-01-01',
  }));
  eraDataConfig.getEras.mockReturnValue(eras);
  return eraDataConfig;
}

/**
 * A `MockProxy<ReferenceLookupService>` whose `keyOf` mirrors the real
 * tab-joined key derivation (pure, no branching -- exempt from the
 * canned-response rule, same as `tp-eras-import.service.spec.ts`'s own
 * `lookup.keyOf` stub) and whose `lookupMap(kind, ...)` resolves from a
 * plain external-id -> DB-id map per kind, keyed under `tpSystemId`. `era`
 * always comes from `eraIdsByName`; `race`/`coach`/`position`/`competition`/
 * `rulesSet` come from `extra`'s matching map when supplied. A kind with no map (or an
 * id the map doesn't declare) resolves to nothing, matching a real
 * unresolved reference.
 *
 * Limitation: the returned `lookupMap` stub ignores its `refs` argument
 * entirely and always answers every entry declared for the requested
 * `kind` — so a service that requests the *wrong* references (e.g. the
 * wrong external id, or omits one it should have asked for) still gets ids
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
  lookup.keyOf.mockImplementation(
    (ref) => `${ref.externalSystemId}\t${ref.externalId}`,
  );
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
      map.set(`${tpSystemId}\t${externalId}`, id);
    }
    return Promise.resolve(map);
  });
  return lookup;
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
