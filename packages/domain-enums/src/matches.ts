/**
 * What kind of match this is within its competition. `normal` covers the
 * bulk of both cup and season play (many cups are just a run of normal
 * matches with no special final); the other values name the specific
 * knock-out stages.
 *
 * There is deliberately no `unknown` catch-all: an importer that cannot
 * recognize a match's stage must fail loudly rather than silently default.
 *
 * Consistency with the owning competition's `type` (e.g. `cup_final` only on
 * a cup, `season_*` only on a season) is NOT enforced in the database —
 * Postgres cannot cross-reference another table in a plain `check()`, and a
 * trigger was judged not worth the complexity. It is validated in
 * `MatchesService.upsert` (packages/game-data) instead.
 */
export const MATCH_CATEGORIES = [
  'normal',
  'cup_final',
  'season_semi_final',
  'season_final',
  'season_bronze',
  'season_qualifier',
] as const;
