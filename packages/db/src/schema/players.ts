import { integer, serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { positions } from './positions';
import { teamEras } from './team-eras';

const playersTable = historyTrackedTable({
  schema: gameData,
  name: 'players',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    teamEraId: integer('team_era_id')
      .references(() => teamEras.id)
      .notNull(),
    positionId: integer('position_id')
      .references(() => positions.id)
      .notNull(),
    // A player's Star Player Points total, sourced independently of the
    // per-event `match_events.spp_value` sum: TP reports it directly, BBL's
    // is recomputed from that sum (see
    // docs/plans/2026-08-12-import-trusted-spp-totals-design.md). Nullable:
    // NULL means no source has populated it.
    sppTotal: integer('spp_total'),
  },
});

export const players = playersTable.table;
export const playersHistory = playersTable.historyTable;

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
