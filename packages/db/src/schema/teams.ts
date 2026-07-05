import { serial, varchar, integer } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { coaches } from './coaches';
import { races } from './races';
import { historyTrackedTable } from './history';

const teamsTable = historyTrackedTable(gameData, 'teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  raceId: integer('race_id')
    .references(() => races.id)
    .notNull(),
  coachId: integer('coach_id')
    .references(() => coaches.id)
    .notNull(),
});

export const teams = teamsTable.table;
export const teamsHistory = teamsTable.historyTable;

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
