import { serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

const rulesSetsTable = historyTrackedTable({
  schema: gameData,
  name: 'rules_sets',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
  },
});

export const rulesSets = rulesSetsTable.table;
export const rulesSetsHistory = rulesSetsTable.historyTable;

export type RulesSet = typeof rulesSets.$inferSelect;
export type NewRulesSet = typeof rulesSets.$inferInsert;
