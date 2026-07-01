import { integer, primaryKey } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { matches } from './matches';
import { teams } from './teams';

export const matchTeams = gameData.table(
  'match_teams',
  {
    matchId: integer('match_id')
      .references(() => matches.id)
      .notNull(),
    teamId: integer('team_id')
      .references(() => teams.id)
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.matchId, t.teamId] }),
  }),
);

export type MatchTeam = typeof matchTeams.$inferSelect;
export type NewMatchTeam = typeof matchTeams.$inferInsert;
