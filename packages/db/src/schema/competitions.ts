import { serial, varchar, integer } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { eras } from './eras';
import { historyTrackedTable } from './history';

export const competitionTypeEnum = gameData.enum('competition_type', [
  'season',
  'cup',
]);

const competitionsTable = historyTrackedTable(gameData, 'competitions', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: competitionTypeEnum('type').notNull(),
  eraId: integer('era_id')
    .references(() => eras.id)
    .notNull(),
});

export const competitions = competitionsTable.table;
export const competitionsHistory = competitionsTable.historyTable;

export type Competition = typeof competitions.$inferSelect;
export type NewCompetition = typeof competitions.$inferInsert;
