import type {
  ReferenceLookupService,
  ResolvableEntityKind,
} from '@blood-bowl-tracker/import';
import type { MockProxy } from 'vitest-mock-extended';

/**
 * Test-only helper. Do not import from production code.
 *
 * Configures a mocked `ReferenceLookupService`'s `keyOf` and `lookupMap`.
 *
 * `keyOf` is a pure, deterministic key derivation with no branching that
 * could drift from the real implementation, so it is exempt from the
 * canned-response rule and always gets the same passthrough stub.
 *
 * `lookupMap` resolves any ref whose external id appears in the map
 * registered for that call's `kind` in `idsByKind`, keyed via the mocked
 * `keyOf`. Each kind's map is supplied by the caller, not derived here, so
 * this mirrors what `ReferenceLookupService` itself does without
 * reimplementing its resolution algorithm.
 */
export function mockReferenceLookup(
  lookup: MockProxy<ReferenceLookupService>,
  idsByKind: Partial<Record<ResolvableEntityKind, Map<string, number>>>,
): void {
  lookup.keyOf.mockImplementation(
    (ref) => `${ref.externalSystemId}\t${ref.externalId}`,
  );
  lookup.lookupMap.mockImplementation((kind, refs) => {
    const idsByExternalId = idsByKind[kind] ?? new Map<string, number>();
    return Promise.resolve(
      new Map(
        refs
          .filter((ref) => idsByExternalId.has(ref.externalId))
          .map((ref) => [
            lookup.keyOf(ref),
            idsByExternalId.get(ref.externalId) as number,
          ]),
      ),
    );
  });
}
