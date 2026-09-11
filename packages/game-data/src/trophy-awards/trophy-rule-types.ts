import type {
  trophyAwardRuleKindEnum,
  trophyAwardRuleMeasureEnum,
  trophyAwardRuleRoleEnum,
} from '@blood-bowl-tracker/db';

import type { ActionType, ConsequenceType } from '../shared/match-event-types';

/** A value of the `trophy_award_rule_kind` DB enum. */
export type TrophyAwardRuleKind =
  (typeof trophyAwardRuleKindEnum.enumValues)[number];

/** A value of the `trophy_award_rule_role` DB enum. */
export type TrophyAwardRuleRole =
  (typeof trophyAwardRuleRoleEnum.enumValues)[number];

/** A value of the `trophy_award_rule_measure` DB enum. */
export type TrophyAwardRuleMeasure =
  (typeof trophyAwardRuleMeasureEnum.enumValues)[number];

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
 * One player a rule selected, with the team era their `trophy_awards` row must
 * name. The team era is the player's own (`players.team_era_id`), not the
 * match's: a player never changes teams, which is exactly why `trophy_awards`
 * can carry a team era for a player award at all.
 */
export interface TrophyRuleWinner {
  playerId: number;
  teamEraId: number;
}
