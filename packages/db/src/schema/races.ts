import { serial, varchar } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { historyTrackedTable } from './history';

const racesTable = historyTrackedTable(gameData, 'races', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const races = racesTable.table;
export const racesHistory = racesTable.historyTable;

export type Race = typeof races.$inferSelect;
export type NewRace = typeof races.$inferInsert;
