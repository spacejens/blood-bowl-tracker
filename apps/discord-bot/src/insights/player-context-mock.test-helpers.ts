import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PlayerContextService } from './player-context.service';

/**
 * Test-only helper. Do not import from production code.
 *
 * A `PlayerContextService` mock canned to attach a fixed suffix to every row.
 * It does not reproduce the real lookup/formatting — that is covered by
 * player-context.service.spec.ts.
 */
export function passthroughPlayerContext(
  contextSuffix = '',
): MockProxy<PlayerContextService> {
  const playerContext = mock<PlayerContextService>();
  playerContext.attachSuffixes.mockImplementation((rows: unknown[]) =>
    Promise.resolve(rows.map((row) => ({ ...(row as object), contextSuffix }))),
  );
  return playerContext;
}
