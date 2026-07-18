import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { competitions } from './competitions';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { teamEras } from './team-eras';

const competitionTeamsTable = historyTrackedTable({
  schema: gameData,
  name: 'competition_teams',
  columns: {
    id: serial('id').primaryKey(),
    competitionId: integer('competition_id')
      .references(() => competitions.id)
      .notNull(),
    teamEraId: integer('team_era_id')
      .references(() => teamEras.id)
      .notNull(),
  },
  extraConfig: (t) => ({
    uniqueCompetitionTeam: unique(
      'competition_teams_competition_id_team_era_id_unique',
    ).on(t.competitionId, t.teamEraId),
  }),
});

export const competitionTeams = competitionTeamsTable.table;
export const competitionTeamsHistory = competitionTeamsTable.historyTable;

export type CompetitionTeam = typeof competitionTeams.$inferSelect;
export type NewCompetitionTeam = typeof competitionTeams.$inferInsert;
