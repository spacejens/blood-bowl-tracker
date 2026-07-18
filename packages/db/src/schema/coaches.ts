import { serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

const coachesTable = historyTrackedTable({
  schema: gameData,
  name: 'coaches',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
  },
});

export const coaches = coachesTable.table;
export const coachesHistory = coachesTable.historyTable;

export type Coach = typeof coaches.$inferSelect;
export type NewCoach = typeof coaches.$inferInsert;
