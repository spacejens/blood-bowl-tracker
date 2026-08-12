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
    // per-event `match_events.spp_value` sum. TP reports it directly. For
    // BBL it is computed as `era-correct event sum + spp_adjustment`: BBL's
    // own published figure mixes award rates across eras (its site
    // recalculated pre-BB2020 totals at BB2020 rates), so it is never stored
    // here directly. Nullable: NULL means no source has populated it.
    sppTotal: integer('spp_total'),
    // Star Player Points a player holds that their recorded match events
    // cannot explain — SPP granted outside the normal per-event flow (see
    // docs/plans/2026-08-12-manual-spp-adjustments-design.md). Computed per
    // source: BBL from its scraped career total minus a forced-rate replay
    // of the player's events; TP from its reported total minus the
    // era-correct event sum. Never negative (clamped to 0). Nullable,
    // mirroring `spp_total`: NULL means not computed; a number — including
    // 0 — means computed and confirmed.
    sppAdjustment: integer('spp_adjustment'),
  },
});

export const players = playersTable.table;
export const playersHistory = playersTable.historyTable;

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
