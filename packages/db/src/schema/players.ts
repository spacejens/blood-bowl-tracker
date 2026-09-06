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
    // cannot explain — SPP granted outside the normal per-event flow.
    // Computed per source: BBL from its scraped career total minus a
    // forced-rate replay of the player's events (recovering the gap despite
    // BBL's site having recalculated older totals at BB2020 rates); TP from
    // its reported total minus the era-correct event sum. Never negative
    // (clamped to 0). Nullable, mirroring `spp_total`: NULL means not
    // computed; a number — including 0 — means computed and confirmed.
    sppAdjustment: integer('spp_adjustment'),
    // The player's own current Move/Strength/Agility/Passing/Armour, as the
    // source reports them. Not merely a copy of the position's baseline:
    // both BBL and TP report a player's current values, and injuries and
    // advancements genuinely drive them away from that baseline.
    //
    // A player has exactly one current characteristic line, unlike a
    // position (one line per rules set, hence the separate
    // `position_rules_sets` table), so these live directly on the row. No
    // rules-set id is stored alongside them: an era can list several rules
    // sets in sequence, so nothing here can resolve one unambiguously —
    // whichever caller needs one for validation supplies it explicitly.
    //
    // move, strength, agility and armour are NOT NULL with no default,
    // matching `position_rules_sets`: 0 is not a legal value for any of the
    // four under any rules set, so there is nothing a database-level fallback
    // could legitimately write — every writer must supply a real number. This
    // does NOT extend to `passing`, which is nullable, has no default, and for
    // which 0 is a real value — see its own comment below.
    move: integer('move').notNull(),
    strength: integer('strength').notNull(),
    agility: integer('agility').notNull(),
    // Nullable with no default, mirroring `position_rules_sets.passing`:
    // NULL permanently means "this player's rules set has no Passing
    // characteristic" (an asserted absence), never "not yet known". A stored
    // 0 is different again, and is a legitimate final value: the player
    // structurally cannot pass (a BB2020 Kroxigor or Ogre), which the
    // `plus_zero_legal` characteristic format renders as a bare "0".
    passing: integer('passing'),
    armour: integer('armour').notNull(),
  },
});

export const players = playersTable.table;
export const playersHistory = playersTable.historyTable;

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
