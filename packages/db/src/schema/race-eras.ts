import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { eras } from './eras';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { races } from './races';

const raceErasTable = historyTrackedTable(
  gameData,
  'race_eras',
  {
    id: serial('id').primaryKey(),
    raceId: integer('race_id')
      .references(() => races.id)
      .notNull(),
    eraId: integer('era_id')
      .references(() => eras.id)
      .notNull(),
  },
  (t) => ({
    uniqueRaceEra: unique('race_eras_race_id_era_id_unique').on(
      t.raceId,
      t.eraId,
    ),
  }),
);

export const raceEras = raceErasTable.table;
export const raceErasHistory = raceErasTable.historyTable;

export type RaceEra = typeof raceEras.$inferSelect;
export type NewRaceEra = typeof raceEras.$inferInsert;
