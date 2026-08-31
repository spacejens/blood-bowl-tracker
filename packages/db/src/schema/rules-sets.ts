import { serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

/**
 * How one of a position's characteristics is expressed under a rules set.
 *
 * - `absent` — the rules set has no such characteristic at all (in practice
 *   only ever Passing, which the pre-BB2020 rules sets do not have).
 * - `bare` — displayed as a plain number.
 * - `plus` — displayed with a trailing "+": the value names a target a die
 *   roll has to meet.
 *
 * `absent` is only usable in practice for Passing today: Move, Strength,
 * Agility and Armour are stored as non-nullable columns on
 * `positions_race_eras`, so configuring one of their format columns as
 * `absent` would make every row for that rules set permanently rejected by
 * `PositionsService` (it always supplies a value for those four). The enum
 * stays uniform across all five columns rather than special-casing Passing,
 * since a future rules set losing a currently-mandatory characteristic is not
 * implausible.
 *
 * Mirrored in api-contract as `CharacteristicFormatSchema`; the two copies are
 * held together by packages/game-data/src/shared/enum-sync.spec.ts.
 */
export const characteristicFormatEnum = gameData.enum('characteristic_format', [
  'absent',
  'bare',
  'plus',
]);

/**
 * The five characteristic-format columns are NOT NULL with defaults rather
 * than NOT NULL alone because the BBL and TP importers create rules sets from
 * their own configs without saying anything about characteristics. The
 * defaults describe the older rules sets (bare Move/Strength/Agility/Armour,
 * no Passing); curated data in tools/import-manual overrides them per rules
 * set.
 */
const rulesSetsTable = historyTrackedTable({
  schema: gameData,
  name: 'rules_sets',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    moveFormat: characteristicFormatEnum('move_format')
      .notNull()
      .default('bare'),
    strengthFormat: characteristicFormatEnum('strength_format')
      .notNull()
      .default('bare'),
    agilityFormat: characteristicFormatEnum('agility_format')
      .notNull()
      .default('bare'),
    passingFormat: characteristicFormatEnum('passing_format')
      .notNull()
      .default('absent'),
    armourFormat: characteristicFormatEnum('armour_format')
      .notNull()
      .default('bare'),
  },
});

export const rulesSets = rulesSetsTable.table;
export const rulesSetsHistory = rulesSetsTable.historyTable;

export type RulesSet = typeof rulesSets.$inferSelect;
export type NewRulesSet = typeof rulesSets.$inferInsert;
