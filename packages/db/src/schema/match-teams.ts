import { serial, integer, unique } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { matches } from './matches';
import { teamEras } from './team-eras';
import { historyTrackedTable } from './history';

const matchTeamsTable = historyTrackedTable(
  gameData,
  'match_teams',
  {
    id: serial('id').primaryKey(),
    matchId: integer('match_id')
      .references(() => matches.id)
      .notNull(),
    teamEraId: integer('team_era_id')
      .references(() => teamEras.id)
      .notNull(),
  },
  (t) => ({
    uniqueMatchTeam: unique('match_teams_match_id_team_era_id_unique').on(
      t.matchId,
      t.teamEraId,
    ),
  }),
);

export const matchTeams = matchTeamsTable.table;
export const matchTeamsHistory = matchTeamsTable.historyTable;

export type MatchTeam = typeof matchTeams.$inferSelect;
export type NewMatchTeam = typeof matchTeams.$inferInsert;
