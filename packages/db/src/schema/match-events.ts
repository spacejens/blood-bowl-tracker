import { pgTable, serial, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { matches } from './matches';
import { teams } from './teams';
import { players } from './players';

export const matchEvents = pgTable('match_events', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id').references(() => matches.id).notNull(),
  type: varchar('type', { length: 100 }).notNull(),
  teamId: integer('team_id').references(() => teams.id).notNull(),
  playerId: integer('player_id').references(() => players.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;
