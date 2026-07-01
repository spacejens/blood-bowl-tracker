import { integer, primaryKey } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { competitions } from './competitions';
import { teams } from './teams';

export const competitionTeams = gameData.table(
  'competition_teams',
  {
    competitionId: integer('competition_id')
      .references(() => competitions.id)
      .notNull(),
    teamId: integer('team_id')
      .references(() => teams.id)
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.competitionId, t.teamId] }),
  }),
);

export type CompetitionTeam = typeof competitionTeams.$inferSelect;
export type NewCompetitionTeam = typeof competitionTeams.$inferInsert;
