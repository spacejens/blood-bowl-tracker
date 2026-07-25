import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { LeaderboardService } from './leaderboard.service';

/**
 * A `LeaderboardService` mock canned to echo its ranking/button inputs back
 * unchanged: rows pass through as-is with a placeholder rank and no
 * truncation, and button entries pass through as a single action row. It does
 * NOT reproduce the real ranking/tie/dedupe/cap/chunk logic — that is covered
 * by `leaderboard.service.spec.ts`. This neutral stand-in exists only so a
 * consumer's own description/button-composition logic can be exercised on the
 * rows a test supplies, without depending on (or re-deriving) how
 * `LeaderboardService` would actually rank them.
 *
 * Test-only. Do not import from production code.
 */
export function passthroughLeaderboard(): MockProxy<LeaderboardService> {
  const leaderboard = mock<LeaderboardService>();
  leaderboard.topRanksWithTies.mockImplementation((rows) => ({
    rows: rows.map((row) => ({ ...row, rank: 1 })),
    truncatedCount: 0,
    tieGroupOpenEnded: false,
  }));
  leaderboard.buildEntityButtons.mockImplementation(
    (rows, buildCustomId, label) =>
      rows.length === 0
        ? []
        : [
            {
              type: 1,
              components: rows.map((row) => ({
                type: 2,
                style: 1,
                label: label(row),
                custom_id: buildCustomId(row),
              })),
            },
          ],
  );
  return leaderboard;
}
