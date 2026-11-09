/**
 * One row of a team's top-players list. Carries the player's position
 * alongside the ranked number so a caller can tell a star player's hire from a
 * regular roster player without a second lookup per row — the deepdive needs
 * that to route the row's drill-down button to the star player deepdive (whose
 * id is a `positions.id`) rather than the per-team player one.
 *
 * `count` is deliberately metric-agnostic: it is whatever number the producing
 * query ranks by, and the presentation layer (`LeaderboardService
 * .topRanksWithTies`, the deepdive's row formatting) treats it as an opaque
 * comparable value.
 */
export interface TeamTopPlayer {
  playerId: number;
  name: string;
  count: number;
  positionId: number;
  positionName: string;
  isStarPlayer: boolean;
}
