import { CHARACTERISTIC_FORMATS } from '@blood-bowl-tracker/domain-enums';
import { serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

/**
 * See `CHARACTERISTIC_FORMATS` in `@blood-bowl-tracker/domain-enums` for what
 * each format means and why `plus_zero_legal` is its own value.
 */
export const characteristicFormatEnum = gameData.enum(
  'characteristic_format',
  CHARACTERISTIC_FORMATS,
);

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
