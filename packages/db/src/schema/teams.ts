import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { coaches } from './coaches';
import { races } from './races';

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  raceId: integer('race_id').references(() => races.id).notNull(),
  coachId: integer('coach_id').references(() => coaches.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
