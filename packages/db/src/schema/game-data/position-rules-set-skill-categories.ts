import { SKILL_ACCESS_LEVELS } from '@blood-bowl-tracker/domain-enums';
import { boolean, integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { gameData } from './pg-schema';
import { positionRulesSets } from './position-rules-sets';
import { skillCategoryEnum } from './skill-rules-sets';

/** See `SKILL_ACCESS_LEVELS` in `@blood-bowl-tracker/domain-enums`. */
export const skillAccessEnum = gameData.enum(
  'skill_access',
  SKILL_ACCESS_LEVELS,
);

/**
 * One skill category a position may take skills from under one rules set,
 * and whether that access is primary or secondary.
 *
 * Anchored to `position_rules_sets.id` like `position_rules_set_skills`, so
 * categories can only be recorded for a position/rules-set pair whose
 * characteristics are already recorded.
 *
 * Unique on the anchor and the category: one category is never both primary
 * and secondary for the same pair, and a change between the two updates
 * `access` in place.
 *
 * Only learnable categories (`LEARNABLE_SKILL_CATEGORIES`) belong here. Trait
 * and unique are rejected by PositionRulesSetSkillCategoriesService rather
 * than by a database constraint, the same way the other position/rules-set
 * rules are enforced in their services.
 *
 * A pair's categories are synced as a complete set. A tracked row can never
 * be deleted (docs/database.md), so a category the latest sync no longer
 * lists is flagged `removed`, and a later sync that lists it again clears the
 * flag. Every reader filters on `removed = false`.
 */
const positionRulesSetSkillCategoriesTable = historyTrackedTable({
  schema: gameData,
  name: 'position_rules_set_skill_categories',
  columns: {
    id: serial('id').primaryKey(),
    positionRulesSetId: integer('position_rules_set_id')
      .references(() => positionRulesSets.id)
      .notNull(),
    skillCategory: skillCategoryEnum('skill_category').notNull(),
    access: skillAccessEnum('access').notNull(),
    removed: boolean('removed').notNull().default(false),
  },
  extraConfig: (t) => ({
    uniqueAnchorCategory: unique(
      'position_rules_set_skill_categories_anchor_category_unique',
    ).on(t.positionRulesSetId, t.skillCategory),
  }),
});

export const positionRulesSetSkillCategories =
  positionRulesSetSkillCategoriesTable.table;
export const positionRulesSetSkillCategoriesHistory =
  positionRulesSetSkillCategoriesTable.historyTable;

export type PositionRulesSetSkillCategory =
  typeof positionRulesSetSkillCategories.$inferSelect;
export type NewPositionRulesSetSkillCategory =
  typeof positionRulesSetSkillCategories.$inferInsert;
