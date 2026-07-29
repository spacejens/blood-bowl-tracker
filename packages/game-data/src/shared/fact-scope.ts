import type { MatchCategory } from '@blood-bowl-tracker/api-contract';

/**
 * The single, mutually-exclusive scope a fact query runs under. At most one
 * field is ever set: `league`, `era`, `competition`, and `category` (a match
 * category) are alternative ways of scoping the same query, not filters meant
 * to be combined. Threaded as one object (rather than four positional
 * arguments) so scoped query methods stay under the repo's 3-parameter ceiling.
 */
export interface FactScope {
  leagueId?: number;
  eraId?: number;
  competitionId?: number;
  category?: MatchCategory;
}

/**
 * The all-time scope: no league, era, competition, or match-category
 * restriction.
 */
export const FACT_SCOPE_ALL_TIME: FactScope = {};
