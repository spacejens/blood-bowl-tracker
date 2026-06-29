import { pgTable, integer, primaryKey } from 'drizzle-orm/pg-core';
import { matches } from './matches';
import { teams } from './teams';

export const matchTeams = pgTable('match_teams', {
  matchId: integer('match_id').references(() => matches.id).notNull(),
  teamId: integer('team_id').references(() => teams.id).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.matchId, t.teamId] }),
}));
