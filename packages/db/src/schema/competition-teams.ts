import { pgTable, integer, primaryKey } from 'drizzle-orm/pg-core';
import { competitions } from './competitions';
import { teams } from './teams';

export const competitionTeams = pgTable('competition_teams', {
  competitionId: integer('competition_id').references(() => competitions.id).notNull(),
  teamId: integer('team_id').references(() => teams.id).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.competitionId, t.teamId] }),
}));
