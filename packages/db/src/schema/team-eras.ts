import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { eras } from './eras';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { teams } from './teams';

const teamErasTable = historyTrackedTable({
  schema: gameData,
  name: 'team_eras',
  columns: {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .references(() => teams.id)
      .notNull(),
    eraId: integer('era_id')
      .references(() => eras.id)
      .notNull(),
  },
  extraConfig: (t) => ({
    uniqueTeamEra: unique('team_eras_team_id_era_id_unique').on(
      t.teamId,
      t.eraId,
    ),
  }),
});

export const teamEras = teamErasTable.table;
export const teamErasHistory = teamErasTable.historyTable;

export type TeamEra = typeof teamEras.$inferSelect;
export type NewTeamEra = typeof teamEras.$inferInsert;
