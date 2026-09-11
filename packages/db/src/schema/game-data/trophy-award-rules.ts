import { sql } from 'drizzle-orm';
import { check, integer, serial, unique, varchar } from 'drizzle-orm/pg-core';

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

/**
 * One position a computed trophy's rule accepts a candidate from —
 * Bierhallenführer is "the Ogre who...", so only an Ogre Blocker or an Ogre
 * Runt Punter can win it, however high a Gnoblar Lineman's SPP sum climbs.
 * Empty for every trophy that restricts nothing, which is all but one today,
 * and empty means UNRESTRICTED — the same "no rows imposes no condition"
 * convention the two match-event-type tables above use.
 *
 * A row names the position by its `Name`-system external id
 * (`"<raceName>: <positionName>"`, what `NameExternalIdService.forPosition`
 * builds) rather than by a `positions.id` foreign key. Two reasons, both
 * about WHEN this is curated:
 *
 *  - Ordering. Award computation runs as the last step of the BBL and TP
 *    importers, so a rule's restriction has to be in the database before
 *    they run — which means curating it in tools/import-manual's
 *    `before-other-importers` phase, where no `positions` row exists yet to
 *    point a foreign key at. A curated string needs nothing to resolve
 *    against at curation time; it is matched at computation time, when the
 *    positions do exist.
 *  - Stability. `positions.name` is overwritten by whichever importer wrote
 *    last (BBL calls the position "Ogre Blockers", TP "Ogre Blocker"), so
 *    matching on the bare name would depend on which importer is mid-run.
 *    External ids are only ever added, never rewritten, so the Name id is
 *    stable from the moment the position is first created.
 *
 * An id matching no position simply contributes no eligible position. That
 * deliberately does NOT widen the rule back to unrestricted: a trophy that
 * curates a restriction none of whose positions exist awards nothing, which
 * is the safe direction for an authoring typo.
 */
const trophyAwardRuleEligiblePositionsTable = historyTrackedTable({
  schema: gameData,
  name: 'trophy_award_rule_eligible_positions',
  columns: {
    id: serial('id').primaryKey(),
    trophyId: integer('trophy_id')
      .references(() => trophies.id, { onDelete: 'cascade' })
      .notNull(),
    positionNameExternalId: varchar('position_name_external_id', {
      length: 255,
    }).notNull(),
  },
  extraConfig: (t) => ({
    uniquePosition: unique(
      'trophy_award_rule_eligible_positions_trophy_position_unique',
    ).on(t.trophyId, t.positionNameExternalId),
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

export const trophyAwardRuleEligiblePositions =
  trophyAwardRuleEligiblePositionsTable.table;
export const trophyAwardRuleEligiblePositionsHistory =
  trophyAwardRuleEligiblePositionsTable.historyTable;

export type TrophyAwardRuleMatchEventType =
  typeof trophyAwardRuleMatchEventTypes.$inferSelect;
export type NewTrophyAwardRuleMatchEventType =
  typeof trophyAwardRuleMatchEventTypes.$inferInsert;
export type TrophyAwardRuleEligiblePosition =
  typeof trophyAwardRuleEligiblePositions.$inferSelect;
export type NewTrophyAwardRuleEligiblePosition =
  typeof trophyAwardRuleEligiblePositions.$inferInsert;
