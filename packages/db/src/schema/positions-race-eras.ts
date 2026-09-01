import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { positions } from './positions';
import { raceEras } from './race-eras';

/**
 * A position's availability for one race in one era, keyed by
 * `(positionId, raceEraId)`.
 *
 * A row means the position was genuinely available: a config override said
 * so, it is a star player, or a player actually used it. Absence of a row
 * means no such positive evidence exists — never "probably available".
 *
 * The characteristics columns (move/strength/agility/passing/armour) are
 * the table's first non-identifying fields, not its whole purpose — more
 * may follow. Each defaults to 0 for a row inserted without them (a source
 * that only knows availability, or an era nobody has curated yet), except
 * `passing`, whose `null` instead permanently means "this rules set has no
 * Passing characteristic at all" and must never be conflated with "not yet
 * known". Which values may (and must) be present depends on the named rules
 * set's declared formats — enforced in `PositionsService.syncRaceEras`
 * rather than by a database constraint, since it depends on another
 * table's row.
 */
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
    move: integer('move').notNull().default(0),
    strength: integer('strength').notNull().default(0),
    agility: integer('agility').notNull().default(0),
    passing: integer('passing').default(0),
    armour: integer('armour').notNull().default(0),
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
