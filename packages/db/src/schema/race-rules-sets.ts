import { integer, primaryKey } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { races } from './races';
import { rulesSets } from './rules-sets';

export const raceRulesSets = gameData.table(
  'race_rules_sets',
  {
    raceId: integer('race_id')
      .references(() => races.id)
      .notNull(),
    rulesSetId: integer('rules_set_id')
      .references(() => rulesSets.id)
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.raceId, t.rulesSetId] }),
  }),
);

export type RaceRulesSet = typeof raceRulesSets.$inferSelect;
export type NewRaceRulesSet = typeof raceRulesSets.$inferInsert;
