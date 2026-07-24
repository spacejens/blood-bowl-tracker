import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type {
  ResolveRefOptions,
  ResolveRefsOptions,
} from '../references/reference-resolver.service';
import { ReferenceResolverService } from '../references/reference-resolver.service';

/**
 * Test-only helper. Do not import from production code.
 *
 * Builds a mocked `ReferenceResolverService` for the entity-processor specs.
 * Its methods reproduce the real service's pure mapping/lookup behaviour
 * (`toExternalIds`, `resolveRef`, `resolveRefs`) against whatever
 * `ExternalIdMap`/systemIds map the calling test builds -- those are plain
 * value objects owned by the test, never a real `ReferenceResolverService` or
 * `ImportResultService`. This lets processor specs assert on genuine call
 * outcomes (resolved ids, recorded errors) instead of canned literals, while
 * keeping the processor under test isolated from its real collaborator.
 */
export function mockReferenceResolver(): MockProxy<ReferenceResolverService> {
  const refResolver = mock<ReferenceResolverService>();

  refResolver.toExternalIds.mockImplementation((refs, systemIds) =>
    refs.map((ref) => {
      const externalSystemId = systemIds.get(ref.system);
      if (externalSystemId === undefined) {
        throw new Error(`Unknown external system "${ref.system}".`);
      }
      return { externalSystemId, externalId: ref.id };
    }),
  );

  refResolver.resolveRef.mockImplementation((options: ResolveRefOptions) => {
    const id = options.idMap.resolve(options.ref);
    if (id === undefined) {
      options.errors.push({
        item: options.item,
        message: `${options.label}: could not resolve reference ${options.ref.system}|${options.ref.id}.`,
      });
    }
    return id;
  });

  refResolver.resolveRefs.mockImplementation((options: ResolveRefsOptions) => {
    const ids: number[] = [];
    let ok = true;
    for (const ref of options.refs) {
      const id = refResolver.resolveRef({
        ref,
        idMap: options.idMap,
        errors: options.errors,
        item: options.item,
        label: options.label,
      });
      if (id === undefined) {
        ok = false;
      } else {
        ids.push(id);
      }
    }
    return ok ? ids : undefined;
  });

  return refResolver;
}
