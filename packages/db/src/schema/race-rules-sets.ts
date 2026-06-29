import { pgTable, integer, primaryKey } from 'drizzle-orm/pg-core';
import { races } from './races';
import { rulesSets } from './rules-sets';

export const raceRulesSets = pgTable('race_rules_sets', {
  raceId: integer('race_id').references(() => races.id).notNull(),
  rulesSetId: integer('rules_set_id').references(() => rulesSets.id).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.raceId, t.rulesSetId] }),
}));
