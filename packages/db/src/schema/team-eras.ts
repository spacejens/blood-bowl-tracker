import { serial, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { teams } from './teams';
import { eras } from './eras';

export const teamEras = gameData.table(
  'team_eras',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .references(() => teams.id)
      .notNull(),
    eraId: integer('era_id')
      .references(() => eras.id)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uniqueTeamEra: unique('team_eras_team_id_era_id_unique').on(
      t.teamId,
      t.eraId,
    ),
  }),
);

export type TeamEra = typeof teamEras.$inferSelect;
export type NewTeamEra = typeof teamEras.$inferInsert;
