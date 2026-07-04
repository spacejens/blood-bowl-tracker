import { serial, integer, timestamp } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { matches } from './matches';
import { players } from './players';
import { teamEras } from './team-eras';

export const matchEvents = gameData.table('match_events', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id')
    .references(() => matches.id)
    .notNull(),
  actingTeamEraId: integer('acting_team_era_id').references(
    () => teamEras.id,
  ),
  consequenceTeamEraId: integer('consequence_team_era_id').references(
    () => teamEras.id,
  ),
  actingPlayerId: integer('acting_player_id').references(() => players.id),
  consequencePlayerId: integer('consequence_player_id').references(
    () => players.id,
  ),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;
