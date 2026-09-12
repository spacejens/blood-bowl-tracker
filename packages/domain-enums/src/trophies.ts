/**
 * Who a trophy is awarded to. A `team` trophy names a team era; a `player`
 * trophy names an individual player (whose team era is still recorded on the
 * award row — see `trophy-awards.ts` in packages/db).
 */
export const TROPHY_RECIPIENT_KINDS = ['team', 'player'] as const;

/**
 * How a trophy's winner is determined.
 *
 * - `direct_source` — the source itself records the winner (every team
 *   placement/knockout trophy). Nothing is computed; an unrecorded award
 *   simply stays unfilled.
 * - `manual` — decided by something no statistic captures (a coaches' vote, a
 *   dice roll). A human has to say how it was actually awarded.
 * - `max_count` — the player with the most matching match events in the
 *   competition.
 * - `max_spp_sum` — the player with the highest sum of `match_events.spp_value`
 *   in the competition, minus any excluded event types.
 * - `career_threshold` — every player whose cumulative career figure reaches a
 *   threshold, awarded once per player in whichever competition they cross it.
 */
export const TROPHY_AWARD_RULE_KINDS = [
  'direct_source',
  'manual',
  'max_count',
  'max_spp_sum',
  'career_threshold',
] as const;

/**
 * Which participant of a matching match event receives a computed award:
 * the event's acting player, or the player the consequence happened to.
 */
export const TROPHY_AWARD_RULE_ROLES = ['acting', 'consequence'] as const;

/**
 * What a `career_threshold` rule accumulates — a count of matching events, or
 * a sum of their Star Player Points. The two `max_*` kinds each imply their
 * own aggregation, so this only ever applies to `career_threshold`.
 */
export const TROPHY_AWARD_RULE_MEASURES = ['event_count', 'spp_sum'] as const;
