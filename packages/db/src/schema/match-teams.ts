import { integer, primaryKey } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { matches } from './matches';
import { teamEras } from './team-eras';

export const matchTeams = gameData.table(
  'match_teams',
  {
    matchId: integer('match_id')
      .references(() => matches.id)
      .notNull(),
    teamEraId: integer('team_era_id')
      .references(() => teamEras.id)
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.matchId, t.teamEraId] }),
  }),
);

export type MatchTeam = typeof matchTeams.$inferSelect;
export type NewMatchTeam = typeof matchTeams.$inferInsert;
