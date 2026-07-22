/**
 * The single, mutually-exclusive scope a fact query runs under. At most one
 * field is ever set: `era`, `competition`, and `league` are alternative ways
 * of scoping the same query, not filters meant to be combined. Threaded as one
 * object (rather than three positional ids) so scoped query methods stay under
 * the repo's 3-parameter ceiling.
 */
export interface FactScope {
  eraId?: number;
  competitionId?: number;
  leagueId?: number;
}
