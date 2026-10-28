import { ADVANCEMENT_KINDS } from '@blood-bowl-tracker/domain-enums';
import { sql } from 'drizzle-orm';
import { check, integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { gameData } from './pg-schema';
import { rulesSets } from './rules-sets';

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
 * one advancement -- the gap to the previous threshold -- never a cumulative
 * threshold, so the costs of a player's first N advancements sum to the Nth
 * threshold. That keeps a single rule for every rules set: unspent SPP is
 * total SPP minus the costs of the advancements gained.
 *
 * `advancementKind` says what the cost buys. The unique key includes it so a
 * rules set that prices advancements by type can hold one row per kind for
 * the same advancement number.
 */
const advancementCostsTable = historyTrackedTable({
  schema: gameData,
  name: 'advancement_costs',
  columns: {
    id: serial('id').primaryKey(),
    rulesSetId: integer('rules_set_id')
      .references(() => rulesSets.id)
      .notNull(),
    advancementNumber: integer('advancement_number').notNull(),
    advancementKind: advancementKindEnum('advancement_kind').notNull(),
    sppCost: integer('spp_cost').notNull(),
  },
  extraConfig: (t) => ({
    uniqueAdvancementCost: unique(
      'advancement_costs_rules_set_number_kind_unique',
    ).on(t.rulesSetId, t.advancementNumber, t.advancementKind),
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
