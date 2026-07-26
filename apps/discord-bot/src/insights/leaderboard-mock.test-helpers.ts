import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { LeaderboardService } from './leaderboard.service';

/**
 * A `LeaderboardService` mock canned to echo its ranking inputs back
 * unchanged: rows pass through as-is with a placeholder rank and no
 * truncation. It does NOT reproduce the real ranking/tie logic — that is
 * covered by `leaderboard.service.spec.ts`. This neutral stand-in exists only
 * so a consumer's own description-composition logic can be exercised on the
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
  return leaderboard;
}
