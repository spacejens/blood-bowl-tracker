import { SKILL_CATEGORIES } from '@blood-bowl-tracker/domain-enums';
import { boolean, integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { gameData } from './pg-schema';
import { rulesSets } from './rules-sets';
import { skills } from './skills';

/**
 * See `SKILL_CATEGORIES` in `@blood-bowl-tracker/domain-enums` for what each
 * category means and why `devious` and `trait` are their own values.
 */
export const skillCategoryEnum = gameData.enum(
  'skill_category',
  SKILL_CATEGORIES,
);

/**
 * The skill × rules-set association: which skills a rules set has, and which
 * category each falls into under it.
 *
 * The category is here rather than on `skills` because a rules set can move a
 * skill between categories — BB2025 both created the Devious category and
 * moved existing skills into it — exactly the reasoning that puts a
 * position's characteristics on `position_rules_sets` rather than on
 * `positions`. A missing row for a pair means the skill does not exist under
 * that rules set; no explicit "not applicable" marker is needed.
 */
const skillRulesSetsTable = historyTrackedTable({
  schema: gameData,
  name: 'skill_rules_sets',
  columns: {
    id: serial('id').primaryKey(),
    skillId: integer('skill_id')
      .references(() => skills.id)
      .notNull(),
    rulesSetId: integer('rules_set_id')
      .references(() => rulesSets.id)
      .notNull(),
    category: skillCategoryEnum('category').notNull(),
    /**
     * BB2025's "elite" distinction: an orthogonal marker, not a category, on
     * a handful of skills (Block, Dodge, Guard, Mighty Blow) that cost more
     * player value to pick than a non-elite skill — player value itself is
     * not yet modeled, so this only records which skills the cost applies
     * to, not the cost. It is not a restriction on which skills can be
     * picked. No earlier rules set has the concept, so every non-BB2025 row
     * is simply `false` — which is why the column defaults to false rather
     * than being nullable: "not elite" and "has no such concept" are the
     * same thing to every consumer.
     */
    isElite: boolean('is_elite').notNull().default(false),
  },
  extraConfig: (t) => ({
    uniqueSkillRulesSet: unique(
      'skill_rules_sets_skill_id_rules_set_id_unique',
    ).on(t.skillId, t.rulesSetId),
  }),
});

export const skillRulesSets = skillRulesSetsTable.table;
export const skillRulesSetsHistory = skillRulesSetsTable.historyTable;

export type SkillRulesSet = typeof skillRulesSets.$inferSelect;
export type NewSkillRulesSet = typeof skillRulesSets.$inferInsert;
