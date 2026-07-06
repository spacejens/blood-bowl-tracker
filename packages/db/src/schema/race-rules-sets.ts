import { serial, integer, unique } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { races } from './races';
import { rulesSets } from './rules-sets';
import { historyTrackedTable } from './history';

const raceRulesSetsTable = historyTrackedTable(
  gameData,
  'race_rules_sets',
  {
    id: serial('id').primaryKey(),
    raceId: integer('race_id')
      .references(() => races.id)
      .notNull(),
    rulesSetId: integer('rules_set_id')
      .references(() => rulesSets.id)
      .notNull(),
  },
  (t) => ({
    uniqueRaceRulesSet: unique(
      'race_rules_sets_race_id_rules_set_id_unique',
    ).on(t.raceId, t.rulesSetId),
  }),
);

export const raceRulesSets = raceRulesSetsTable.table;
export const raceRulesSetsHistory = raceRulesSetsTable.historyTable;

export type RaceRulesSet = typeof raceRulesSets.$inferSelect;
export type NewRaceRulesSet = typeof raceRulesSets.$inferInsert;
