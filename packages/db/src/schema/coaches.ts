import { serial, varchar } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { historyTrackedTable } from './history';

const coachesTable = historyTrackedTable(gameData, 'coaches', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const coaches = coachesTable.table;
export const coachesHistory = coachesTable.historyTable;

export type Coach = typeof coaches.$inferSelect;
export type NewCoach = typeof coaches.$inferInsert;
