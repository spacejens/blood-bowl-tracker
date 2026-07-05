import { serial, integer, unique } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { competitions } from './competitions';
import { teamEras } from './team-eras';
import { historyTrackedTable } from './history';

const competitionTeamsTable = historyTrackedTable(
  gameData,
  'competition_teams',
  {
    id: serial('id').primaryKey(),
    competitionId: integer('competition_id')
      .references(() => competitions.id)
      .notNull(),
    teamEraId: integer('team_era_id')
      .references(() => teamEras.id)
      .notNull(),
  },
  (t) => ({
    uniqueCompetitionTeam: unique(
      'competition_teams_competition_id_team_era_id_unique',
    ).on(t.competitionId, t.teamEraId),
  }),
);

export const competitionTeams = competitionTeamsTable.table;
export const competitionTeamsHistory = competitionTeamsTable.historyTable;

export type CompetitionTeam = typeof competitionTeams.$inferSelect;
export type NewCompetitionTeam = typeof competitionTeams.$inferInsert;
