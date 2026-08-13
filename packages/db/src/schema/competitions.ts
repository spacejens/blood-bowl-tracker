import { date, integer, serial, varchar } from 'drizzle-orm/pg-core';

import { eras } from './eras';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

export const competitionTypeEnum = gameData.enum('competition_type', [
  'season',
  'cup',
]);

const competitionsTable = historyTrackedTable({
  schema: gameData,
  name: 'competitions',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    type: competitionTypeEnum('type').notNull(),
    eraId: integer('era_id')
      .references(() => eras.id)
      .notNull(),
    // Nullable for now: nothing populates competition dates yet (#417
    // backfills them, #434 then tightens start_date to NOT NULL).
    startDate: date('start_date'),
    endDate: date('end_date'),
  },
});

export const competitions = competitionsTable.table;
export const competitionsHistory = competitionsTable.historyTable;

export type Competition = typeof competitions.$inferSelect;
export type NewCompetition = typeof competitions.$inferInsert;
