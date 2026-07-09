import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { matches } from './matches';
import { gameData } from './pg-schema';
import { teamEras } from './team-eras';

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
