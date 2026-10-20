import type {
  ActionType,
  ConsequenceType,
} from '@blood-bowl-tracker/domain-enums';

/**
 * One trophy rule's curated match-event types, split by which `match_events`
 * column each filters. Either list may be empty, which means "do not narrow on
 * that column at all" — a `max_spp_sum` rule with both empty sums every event
 * that carries SPP.
 */
export interface TrophyRuleEventTypes {
  actionTypes: readonly ActionType[];
  consequenceTypes: readonly ConsequenceType[];
}

/**
 * The `positions` rows a trophy rule accepts a candidate from, already
 * resolved from the curated `Name`-system external ids in
 * `trophy_award_rule_eligible_positions`.
 *
 * `undefined` means the trophy curates no restriction and every position is
 * eligible. An empty array is NOT the same thing: it means the trophy does
 * restrict, but none of its curated positions exist, so nothing is eligible.
 * See `TrophyRulePositionFilterService.build`.
 */
export type TrophyRuleEligiblePositions = readonly number[] | undefined;

/**
 * One player a rule selected, with the team era their `trophy_awards` row must
 * name. The team era is the player's own (`players.team_era_id`), not the
 * match's: a player never changes teams, which is exactly why `trophy_awards`
 * can carry a team era for a player award at all.
 */
export interface TrophyRuleWinner {
  playerId: number;
  teamEraId: number;
}
