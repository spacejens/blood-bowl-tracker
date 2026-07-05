import { serial, integer } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { matches } from './matches';
import { players } from './players';
import { teamEras } from './team-eras';
import { historyTrackedTable } from './history';

const matchEventsTable = historyTrackedTable(gameData, 'match_events', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id')
    .references(() => matches.id)
    .notNull(),
  actingTeamEraId: integer('acting_team_era_id').references(() => teamEras.id),
  consequenceTeamEraId: integer('consequence_team_era_id').references(
    () => teamEras.id,
  ),
  actingPlayerId: integer('acting_player_id').references(() => players.id),
  consequencePlayerId: integer('consequence_player_id').references(
    () => players.id,
  ),
});

export const matchEvents = matchEventsTable.table;
export const matchEventsHistory = matchEventsTable.historyTable;

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;
