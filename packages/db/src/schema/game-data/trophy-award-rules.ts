import { sql } from 'drizzle-orm';
import { check, integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { actionTypeEnum, consequenceTypeEnum } from './match-events';
import { gameData } from './pg-schema';
import { trophies } from './trophies';

/**
 * One match-event type a computed trophy's rule counts (or, for
 * `max_spp_sum`, sums SPP over).
 *
 * Exactly one of `action_type`/`consequence_type` is set per row, mirroring
 * the `trophies_group_or_league` style: the two domain enums deliberately
 * share value names (`casualty`, `badly_hurt`, `serious_injury`, `death`), so
 * a single text column could not say which of `match_events`' two columns the
 * value filters on. A rule that curates both kinds matches an event only when
 * BOTH sides match — which is how "most foul casualties" (action `foul` AND a
 * casualty consequence, credited to the acting player) is expressed.
 *
 * Empty for a `direct_source`/`manual` trophy, and legitimately empty for a
 * `max_spp_sum` trophy that sums every SPP-bearing event.
 */
const trophyAwardRuleMatchEventTypesTable = historyTrackedTable({
  schema: gameData,
  name: 'trophy_award_rule_match_event_types',
  columns: {
    id: serial('id').primaryKey(),
    trophyId: integer('trophy_id')
      .references(() => trophies.id, { onDelete: 'cascade' })
      .notNull(),
    actionType: actionTypeEnum('action_type'),
    consequenceType: consequenceTypeEnum('consequence_type'),
  },
  extraConfig: (t) => ({
    oneType: check(
      'trophy_award_rule_match_event_types_one_type',
      sql`(${t.actionType} IS NOT NULL) != (${t.consequenceType} IS NOT NULL)`,
    ),
    uniqueType: unique('trophy_award_rule_match_event_types_trophy_type_unique')
      .on(t.trophyId, t.actionType, t.consequenceType)
      .nullsNotDistinct(),
  }),
});

/**
 * One match-event type subtracted back out of a `max_spp_sum` rule's total —
 * Bierhallenführer excludes `mvp_award`. Same shape and same one-of-two check
 * as the included table above; empty for every trophy that needs no exclusion,
 * which is all but one today.
 */
const trophyAwardRuleExcludedMatchEventTypesTable = historyTrackedTable({
  schema: gameData,
  name: 'trophy_award_rule_excluded_match_event_types',
  columns: {
    id: serial('id').primaryKey(),
    trophyId: integer('trophy_id')
      .references(() => trophies.id, { onDelete: 'cascade' })
      .notNull(),
    actionType: actionTypeEnum('action_type'),
    consequenceType: consequenceTypeEnum('consequence_type'),
  },
  extraConfig: (t) => ({
    oneType: check(
      'trophy_award_rule_excluded_match_event_types_one_type',
      sql`(${t.actionType} IS NOT NULL) != (${t.consequenceType} IS NOT NULL)`,
    ),
    uniqueType: unique(
      'trophy_award_rule_excluded_match_event_types_trophy_type_unique',
    )
      .on(t.trophyId, t.actionType, t.consequenceType)
      .nullsNotDistinct(),
  }),
});

export const trophyAwardRuleMatchEventTypes =
  trophyAwardRuleMatchEventTypesTable.table;
export const trophyAwardRuleMatchEventTypesHistory =
  trophyAwardRuleMatchEventTypesTable.historyTable;
export const trophyAwardRuleExcludedMatchEventTypes =
  trophyAwardRuleExcludedMatchEventTypesTable.table;
export const trophyAwardRuleExcludedMatchEventTypesHistory =
  trophyAwardRuleExcludedMatchEventTypesTable.historyTable;

export type TrophyAwardRuleMatchEventType =
  typeof trophyAwardRuleMatchEventTypes.$inferSelect;
export type NewTrophyAwardRuleMatchEventType =
  typeof trophyAwardRuleMatchEventTypes.$inferInsert;
