import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { EraGroupable, EraSection } from './era-section-grouper.service';
import { EraSectionGrouperService } from './era-section-grouper.service';

/**
 * Test-only helper. Do not import from production code.
 *
 * An `EraSectionGrouperService` mock canned to answer "all of these are one
 * era", whatever rows it is handed. It never inspects `eraId`, so it does not
 * reproduce the real adjacency grouping — that is covered by
 * era-section-grouper.service.spec.ts. Use it in the many call-site tests
 * whose subject is something other than the grouping itself.
 */
export function singleEraSectionGrouper(
  eraName = 'BB2020',
): MockProxy<EraSectionGrouperService> {
  const grouper = mock<EraSectionGrouperService>();
  grouper.group.mockImplementation((rows: EraGroupable[]) => [
    { eraName, rows },
  ]);
  return grouper;
}

/**
 * Test-only helper. Do not import from production code.
 *
 * An `EraSectionGrouperService` mock canned to return exactly the sections
 * the test names, for the tests that assert on multi-era rendering.
 */
export function cannedEraSectionGrouper(
  sections: EraSection<EraGroupable>[],
): MockProxy<EraSectionGrouperService> {
  const grouper = mock<EraSectionGrouperService>();
  grouper.group.mockReturnValue(sections);
  return grouper;
}
