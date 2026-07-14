import { date, integer, serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { leagues } from './leagues';
import { gameData } from './pg-schema';

const erasTable = historyTrackedTable(gameData, 'eras', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  leagueId: integer('league_id')
    .references(() => leagues.id)
    .notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
});

export const eras = erasTable.table;
export const erasHistory = erasTable.historyTable;

export type Era = typeof eras.$inferSelect;
export type NewEra = typeof eras.$inferInsert;
