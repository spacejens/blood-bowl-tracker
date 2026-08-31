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
 * Mirrored in api-contract as `CharacteristicFormatSchema`; the two copies are
 * held together by packages/game-data/src/shared/enum-sync.spec.ts.
 */
export const characteristicFormatEnum = gameData.enum('characteristic_format', [
  'absent',
  'bare',
  'plus',
]);

/**
 * A rules set, plus the configuration saying which position characteristics it
 * has and how each is displayed. The five format columns are configuration
 * about the rules set, not about any position: a position's actual values live
 * in `position_rules_sets`, and PositionRulesSetsService rejects any row whose
 * values disagree with what these columns declare.
 *
 * They are NOT NULL with defaults rather than NOT NULL alone because the BBL
 * and TP importers create rules sets from their own configs without saying
 * anything about characteristics. The defaults describe the older rules sets
 * (bare Move/Strength/Agility/Armour, no Passing); curated data in
 * tools/import-manual overrides them per rules set.
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
