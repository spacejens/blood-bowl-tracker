import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { positions } from './positions';
import { raceEras } from './race-eras';

const positionsRaceErasTable = historyTrackedTable({
  schema: gameData,
  name: 'positions_race_eras',
  columns: {
    id: serial('id').primaryKey(),
    positionId: integer('position_id')
      .references(() => positions.id)
      .notNull(),
    raceEraId: integer('race_era_id')
      .references(() => raceEras.id)
      .notNull(),
  },
  extraConfig: (t) => ({
    uniquePositionRaceEra: unique(
      'positions_race_eras_position_id_race_era_id_unique',
    ).on(t.positionId, t.raceEraId),
  }),
});

export const positionsRaceEras = positionsRaceErasTable.table;
export const positionsRaceErasHistory = positionsRaceErasTable.historyTable;

export type PositionRaceEra = typeof positionsRaceEras.$inferSelect;
export type NewPositionRaceEra = typeof positionsRaceEras.$inferInsert;
