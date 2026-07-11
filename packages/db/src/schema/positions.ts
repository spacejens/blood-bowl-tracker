import { boolean, serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

const positionsTable = historyTrackedTable(gameData, 'positions', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  isStarPlayer: boolean('is_star_player').notNull(),
});

export const positions = positionsTable.table;
export const positionsHistory = positionsTable.historyTable;

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
