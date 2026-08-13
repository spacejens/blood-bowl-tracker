import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { actionTypeEnum } from './match-events';
import { gameData } from './pg-schema';
import { races } from './races';
import { rulesSets } from './rules-sets';

/**
 * How many Star Player Points the acting player earns for one action type
 * under one rules set — the standardised award table BBL-sourced events are
 * scored from. TP-sourced events never consult it: TP reports its own
 * per-event figure, which already reflects race and random-event exceptions
 * this table does not model (see docs/plans/2026-08-11-standardised-spp-totals-design.md).
 *
 * `raceId` is nullable and means "baseline": a NULL row applies to every race
 * of that rules set that has no more specific row, and a non-null row
 * overrides the baseline for that one race (BB2025's "Brawlin' Brutes" swap is
 * the only such override today).
 *
 * `actionType` reuses the `action_type` enum, but only the SPP-earning values
 * ever get a row: touchdown, completion, interception, deflection, mvp_award,
 * and every casualty-caused severity. `foul` earns no SPP and is deliberately
 * absent, consistent with CASUALTY_CAUSED_TYPES in packages/game-data.
 *
 * The unique constraint is NULLS NOT DISTINCT so the baseline row itself is
 * unique per (rules set, action type) — Postgres's NULLS DISTINCT default
 * would permit duplicate baselines, which would break resolveSppValue's
 * baseline-vs-override lookup in packages/game-data.
 */
const sppAwardValuesTable = historyTrackedTable({
  schema: gameData,
  name: 'spp_award_values',
  columns: {
    id: serial('id').primaryKey(),
    rulesSetId: integer('rules_set_id')
      .references(() => rulesSets.id)
      .notNull(),
    raceId: integer('race_id').references(() => races.id),
    actionType: actionTypeEnum('action_type').notNull(),
    sppValue: integer('spp_value').notNull(),
  },
  extraConfig: (t) => ({
    uniqueSppAwardValue: unique('spp_award_values_rules_set_race_action_unique')
      .on(t.rulesSetId, t.raceId, t.actionType)
      .nullsNotDistinct(),
  }),
});

export const sppAwardValues = sppAwardValuesTable.table;
export const sppAwardValuesHistory = sppAwardValuesTable.historyTable;

export type SppAwardValue = typeof sppAwardValues.$inferSelect;
export type NewSppAwardValue = typeof sppAwardValues.$inferInsert;
