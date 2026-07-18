import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { eras } from './eras';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { rulesSets } from './rules-sets';

const eraRulesSetsTable = historyTrackedTable({
  schema: gameData,
  name: 'era_rules_sets',
  columns: {
    id: serial('id').primaryKey(),
    eraId: integer('era_id')
      .references(() => eras.id)
      .notNull(),
    rulesSetId: integer('rules_set_id')
      .references(() => rulesSets.id)
      .notNull(),
  },
  extraConfig: (t) => ({
    uniqueEraRulesSet: unique('era_rules_sets_era_id_rules_set_id_unique').on(
      t.eraId,
      t.rulesSetId,
    ),
  }),
});

export const eraRulesSets = eraRulesSetsTable.table;
export const eraRulesSetsHistory = eraRulesSetsTable.historyTable;

export type EraRulesSet = typeof eraRulesSets.$inferSelect;
export type NewEraRulesSet = typeof eraRulesSets.$inferInsert;
