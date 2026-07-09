import { integer, serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { races } from './races';

const positionsTable = historyTrackedTable(gameData, 'positions', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  raceId: integer('race_id')
    .references(() => races.id)
    .notNull(),
});

export const positions = positionsTable.table;
export const positionsHistory = positionsTable.historyTable;

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
