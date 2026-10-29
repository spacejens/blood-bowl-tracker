import { SKILL_ACCESS_LEVELS } from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

import { SkillCategorySchema } from './skill-rules-set';

/** See `SKILL_ACCESS_LEVELS` in `@blood-bowl-tracker/domain-enums`. */
export const SkillAccessSchema = z.enum(SKILL_ACCESS_LEVELS);

/**
 * A position's complete primary and secondary skill categories under one
 * rules set. Any SkillCategory is accepted at this boundary. The server
 * rejects `trait` and `unique`, and a category listed twice, with a message
 * naming the entry.
 */
export const PositionSkillCategoriesSchema = z.object({
  primary: z.array(SkillCategorySchema),
  secondary: z.array(SkillCategorySchema),
});

/**
 * One (position, rules set) pair's full category set, keyed by
 * `(positionId, rulesSetId)` like `positionRulesSetKeywords`. The server
 * resolves the `position_rules_sets` row itself and rejects a pair with no
 * characteristics recorded yet.
 */
export const PositionRulesSetSkillCategoriesEntrySchema =
  PositionSkillCategoriesSchema.extend({
    positionId: z.number().int(),
    rulesSetId: z.number().int(),
  });

/**
 * Not an upsert: rows are keyed by their natural pair rather than by external
 * ids. Each entry replaces its pair's set, and categories it no longer lists
 * are flagged removed, never deleted.
 */
export const SyncPositionRulesSetSkillCategoriesSchema = z.object({
  entries: z.array(PositionRulesSetSkillCategoriesEntrySchema),
});

/** The ids of every listed category's row, in entry order, primary first. */
export const SyncPositionRulesSetSkillCategoriesResultSchema = z.object({
  positionRulesSetSkillCategoryIds: z.array(z.number()),
});

export type SkillAccessValue = z.infer<typeof SkillAccessSchema>;
export type PositionSkillCategories = z.infer<
  typeof PositionSkillCategoriesSchema
>;
export type PositionRulesSetSkillCategoriesEntry = z.infer<
  typeof PositionRulesSetSkillCategoriesEntrySchema
>;
export type SyncPositionRulesSetSkillCategories = z.infer<
  typeof SyncPositionRulesSetSkillCategoriesSchema
>;
export type SyncPositionRulesSetSkillCategoriesResult = z.infer<
  typeof SyncPositionRulesSetSkillCategoriesResultSchema
>;
