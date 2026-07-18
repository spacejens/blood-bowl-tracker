import { integer, serial, varchar } from 'drizzle-orm/pg-core';

import { coaches } from './coaches';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { races } from './races';

const teamsTable = historyTrackedTable({
  schema: gameData,
  name: 'teams',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    raceId: integer('race_id')
      .references(() => races.id)
      .notNull(),
    coachId: integer('coach_id')
      .references(() => coaches.id)
      .notNull(),
  },
});

export const teams = teamsTable.table;
export const teamsHistory = teamsTable.historyTable;

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
