import { boolean, integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { positions } from './positions';
import { races } from './races';

const positionsRacesTable = historyTrackedTable(
  gameData,
  'positions_races',
  {
    id: serial('id').primaryKey(),
    positionId: integer('position_id')
      .references(() => positions.id)
      .notNull(),
    raceId: integer('race_id')
      .references(() => races.id)
      .notNull(),
    isDeleted: boolean('is_deleted').notNull(),
  },
  (t) => ({
    uniquePositionRace: unique('positions_races_position_id_race_id_unique').on(
      t.positionId,
      t.raceId,
    ),
  }),
);

export const positionsRaces = positionsRacesTable.table;
export const positionsRacesHistory = positionsRacesTable.historyTable;

export type PositionRace = typeof positionsRaces.$inferSelect;
export type NewPositionRace = typeof positionsRaces.$inferInsert;
