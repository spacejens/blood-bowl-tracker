import { integer, primaryKey } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { competitions } from './competitions';
import { teamEras } from './team-eras';

export const competitionTeams = gameData.table(
  'competition_teams',
  {
    competitionId: integer('competition_id')
      .references(() => competitions.id)
      .notNull(),
    teamEraId: integer('team_era_id')
      .references(() => teamEras.id)
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.competitionId, t.teamEraId] }),
  }),
);

export type CompetitionTeam = typeof competitionTeams.$inferSelect;
export type NewCompetitionTeam = typeof competitionTeams.$inferInsert;
