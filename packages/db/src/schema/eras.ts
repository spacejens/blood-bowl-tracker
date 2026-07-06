import { serial, varchar, integer, date } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { leagues } from './leagues';
import { rulesSets } from './rules-sets';
import { externalSystems } from './external-systems';
import { historyTrackedTable } from './history';

const erasTable = historyTrackedTable(gameData, 'eras', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  leagueId: integer('league_id')
    .references(() => leagues.id)
    .notNull(),
  rulesSetId: integer('rules_set_id')
    .references(() => rulesSets.id)
    .notNull(),
  externalSystemId: integer('external_system_id')
    .references(() => externalSystems.id)
    .notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
});

export const eras = erasTable.table;
export const erasHistory = erasTable.historyTable;

export type Era = typeof eras.$inferSelect;
export type NewEra = typeof eras.$inferInsert;
