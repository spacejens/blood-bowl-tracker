import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { positions } from './positions';
import { raceEras } from './race-eras';

/**
 * A position's availability for one race in one era, together with that
 * position's characteristics there.
 *
 * A row means the position was genuinely available: a config override said
 * so, it is a star player, or a player actually used it. Absence of a row
 * means no such positive evidence exists — never "probably available".
 *
 * The grain is `(positionId, raceEraId)`, deliberately without a rules-set
 * column even though one era can span several rules sets. In every real era
 * all of its rules sets share the same characteristic formats, so a single
 * row per race era carries the position's characteristics correctly; the
 * importer picks the era's last declared rules set purely to decide which
 * formats to validate against.
 *
 * `passing` is nullable and has no default: null permanently means "this
 * rules set has no Passing characteristic at all", and must never be
 * conflated with "not yet known".
 *
 * The `DEFAULT 0` on the other four is a temporary compromise so a row can
 * exist as "known available, characteristics not yet known" (a source that
 * only knows availability, or an era nobody has curated yet). A follow-up
 * sub-issue of #666 removes these defaults after a production database
 * reset, restoring the invariant that a row's characteristics are always
 * real.
 *
 * Which of the five values may (and must) be present is enforced in
 * PositionsService.syncRaceEras against the named rules set's declared
 * formats, not by a database constraint: the rule depends on another
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
    passing: integer('passing'),
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
