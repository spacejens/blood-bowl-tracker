import { serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

const racesTable = historyTrackedTable({
  schema: gameData,
  name: 'races',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
  },
});

export const races = racesTable.table;
export const racesHistory = racesTable.historyTable;

export type Race = typeof races.$inferSelect;
export type NewRace = typeof races.$inferInsert;
