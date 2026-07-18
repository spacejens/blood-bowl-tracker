import { serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

const leaguesTable = historyTrackedTable({
  schema: gameData,
  name: 'leagues',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
  },
});

export const leagues = leaguesTable.table;
export const leaguesHistory = leaguesTable.historyTable;

export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
