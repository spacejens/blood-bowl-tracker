import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TeamContextService } from './team-context.service';

/**
 * Test-only helper. Do not import from production code.
 *
 * A `TeamContextService` mock canned to attach a fixed suffix to every row.
 * It does not reproduce the real lookup/formatting — that is covered by
 * team-context.service.spec.ts.
 */
export function passthroughTeamContext(
  contextSuffix = '',
): MockProxy<TeamContextService> {
  const teamContext = mock<TeamContextService>();
  teamContext.attachSuffixes.mockImplementation((rows: unknown[]) =>
    Promise.resolve(rows.map((row) => ({ ...(row as object), contextSuffix }))),
  );
  return teamContext;
}
