import { serial, integer, timestamp } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { matches } from './matches';
import { players } from './players';
import { teams } from './teams';

export const matchEvents = gameData.table('match_events', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id').references(() => matches.id).notNull(),
  actingTeamId: integer('acting_team_id').references(() => teams.id),
  consequenceTeamId: integer('consequence_team_id').references(() => teams.id),
  actingPlayerId: integer('acting_player_id').references(() => players.id),
  consequencePlayerId: integer('consequence_player_id').references(() => players.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;
