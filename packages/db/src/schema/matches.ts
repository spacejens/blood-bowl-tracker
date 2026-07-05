import { serial, integer, timestamp } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { competitions } from './competitions';
import { historyTrackedTable } from './history';

const matchesTable = historyTrackedTable(gameData, 'matches', {
  id: serial('id').primaryKey(),
  competitionId: integer('competition_id')
    .references(() => competitions.id)
    .notNull(),
  playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
});

export const matches = matchesTable.table;
export const matchesHistory = matchesTable.historyTable;

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
