import { serial, varchar } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { historyTrackedTable } from './history';

const leaguesTable = historyTrackedTable(gameData, 'leagues', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const leagues = leaguesTable.table;
export const leaguesHistory = leaguesTable.historyTable;

export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
