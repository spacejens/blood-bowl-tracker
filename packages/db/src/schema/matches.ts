import { pgTable, serial, integer, timestamp } from 'drizzle-orm/pg-core';
import { teams } from './teams';

export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  homeTeamId: integer('home_team_id').references(() => teams.id).notNull(),
  awayTeamId: integer('away_team_id').references(() => teams.id).notNull(),
  playedAt: timestamp('played_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
