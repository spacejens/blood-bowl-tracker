import type { ExternalId } from '@blood-bowl-tracker/api-contract';
import type {
  ReferenceLookupService,
  ResolvableEntityKind,
} from '@blood-bowl-tracker/import';
import type { MockProxy } from 'vitest-mock-extended';

/**
 * Test-only helper. Do not import from production code.
 *
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
    (ref: ExternalId) => `${ref.externalId}::${ref.externalSystemId}`,
  );
}

/**
 * Test-only helper. Do not import from production code.
 *
 * Configures a mocked `ReferenceLookupService`'s `keyOf` (via `mockKeyOf`)
 * and `lookupMap`.
 *
 * `lookupMap` resolves any ref whose external id appears in the map
 * registered for that call's `kind` in `idsByKind`, keyed via the mocked
 * `keyOf`. Each kind's map is supplied by the caller, not derived here, so
 * this answers canned ids without reimplementing `ReferenceLookupService`'s
 * own resolution algorithm.
 */
export function mockReferenceLookup(
  lookup: MockProxy<ReferenceLookupService>,
  idsByKind: Partial<Record<ResolvableEntityKind, Map<string, number>>>,
): void {
  mockKeyOf(lookup);
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
