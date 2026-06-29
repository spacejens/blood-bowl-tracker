import { pgTable, serial, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { matches } from './matches';
import { players } from './players';
import { teams } from './teams';

export const matchEvents = pgTable('match_events', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id').references(() => matches.id).notNull(),
  type: varchar('type', { length: 100 }).notNull(),
  actingTeamId: integer('acting_team_id').references(() => teams.id),
  consequenceTeamId: integer('consequence_team_id').references(() => teams.id),
  actingPlayerId: integer('acting_player_id').references(() => players.id),
  consequencePlayerId: integer('consequence_player_id').references(() => players.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;
