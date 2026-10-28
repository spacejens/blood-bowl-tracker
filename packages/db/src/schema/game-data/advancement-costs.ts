import { ADVANCEMENT_KINDS } from '@blood-bowl-tracker/domain-enums';
import { sql } from 'drizzle-orm';
import { check, integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { leagues } from './leagues';
import { gameData } from './pg-schema';
import { rulesSets } from './rules-sets';
import { skills } from './skills';

/** See `ADVANCEMENT_KINDS` in `@blood-bowl-tracker/domain-enums`. */
export const advancementKindEnum = gameData.enum(
  'advancement_kind',
  ADVANCEMENT_KINDS,
);

/**
 * How many Star Player Points one advancement costs under one rules set.
 *
 * `advancementNumber` is 1-based: the nth advancement a player gains, skills
 * and characteristic increases counted alike. `sppCost` is the cost of that
 * one advancement, never a cumulative threshold. Under fixed thresholds it is
 * the gap to the previous threshold, so the costs of a player's first N
 * advancements sum to the Nth threshold. That keeps a single rule for every
 * rules set: unspent SPP is total SPP minus the costs of the advancements
 * gained.
 *
 * `advancementKind` says what the cost buys. The unique key includes it so a
 * rules set that prices advancements by type can hold one row per kind for
 * the same advancement number.
 *
 * `leagueId` is null on a rules set's own costs, which apply to every player
 * under that rules set. A row with a league is a house rule: it applies only
 * to players of that league (player -> team era -> era -> league), in
 * addition to the rules set's rows, never in place of them. The unique key
 * is NULLS NOT DISTINCT so rules-set rows stay unique per rules set, number
 * and kind.
 *
 * `skillId` names the fixed skill a `granted_skill` advancement grants, and
 * is set on exactly those rows. The check compares the kind as text because
 * the migration that added `granted_skill` also adds the check, and Postgres
 * does not allow an enum value to be used in the transaction that added it.
 */
const advancementCostsTable = historyTrackedTable({
  schema: gameData,
  name: 'advancement_costs',
  columns: {
    id: serial('id').primaryKey(),
    rulesSetId: integer('rules_set_id')
      .references(() => rulesSets.id)
      .notNull(),
    leagueId: integer('league_id').references(() => leagues.id),
    advancementNumber: integer('advancement_number').notNull(),
    advancementKind: advancementKindEnum('advancement_kind').notNull(),
    skillId: integer('skill_id').references(() => skills.id),
    sppCost: integer('spp_cost').notNull(),
  },
  extraConfig: (t) => ({
    uniqueAdvancementCost: unique(
      'advancement_costs_rules_set_league_number_kind_unique',
    )
      .on(t.rulesSetId, t.leagueId, t.advancementNumber, t.advancementKind)
      .nullsNotDistinct(),
    skillMatchesKind: check(
      'advancement_costs_skill_matches_kind',
      sql`(${t.skillId} is not null) = (${t.advancementKind}::text = 'granted_skill')`,
    ),
    advancementNumberPositive: check(
      'advancement_costs_advancement_number_positive',
      sql`${t.advancementNumber} > 0`,
    ),
    sppCostPositive: check(
      'advancement_costs_spp_cost_positive',
      sql`${t.sppCost} > 0`,
    ),
  }),
});

export const advancementCosts = advancementCostsTable.table;
export const advancementCostsHistory = advancementCostsTable.historyTable;

export type AdvancementCost = typeof advancementCosts.$inferSelect;
export type NewAdvancementCost = typeof advancementCosts.$inferInsert;
