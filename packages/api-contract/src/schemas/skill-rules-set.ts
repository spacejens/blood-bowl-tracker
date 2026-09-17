import { SKILL_CATEGORIES } from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

/**
 * See `SKILL_CATEGORIES` in `@blood-bowl-tracker/domain-enums` for what each
 * category means and why `devious` and `trait` are their own values.
 */
export const SkillCategorySchema = z.enum(SKILL_CATEGORIES);

/**
 * One skill's category under one rules set. A row's existence is itself the
 * assertion that the rules set has the skill at all; a rules set with no row
 * for a skill simply does not have it.
 */
export const SkillRulesSetEntrySchema = z.object({
  skillId: z.number().int(),
  rulesSetId: z.number().int(),
  category: SkillCategorySchema,
  /**
   * BB2025's orthogonal "elite" marker. Required rather than optional so a
   * caller cannot silently leave a previously-elite row's flag untouched:
   * `sync` rewrites a matched row wholesale, and every writer (the curated
   * import) knows the value it means to store.
   */
  isElite: z.boolean(),
});

/**
 * Not an upsert: a skill/rules-set row has no external ids — its natural key
 * is the (skill, rules set) pair — so there is no entity+created shape to
 * return and no external-id conflict to detect, the same reason
 * `positionRulesSets.sync` is a sync procedure.
 */
export const SyncSkillRulesSetsSchema = z.object({
  entries: z.array(SkillRulesSetEntrySchema),
});

export const SyncSkillRulesSetsResultSchema = z.object({
  skillRulesSetIds: z.array(z.number()),
});

/**
 * One stored association as the read procedure returns it, without the
 * `skillId` the caller already supplied as input.
 */
export const SkillRulesSetCategorySchema = z.object({
  rulesSetId: z.number().int(),
  category: SkillCategorySchema,
  isElite: z.boolean(),
});

/**
 * Input of the read procedure: one skill at a time. A skill has only a
 * handful of rows (one per rules set that has it), and a caller already holds
 * the skill id from its own `skills.upsert` response — the same reasoning as
 * `ListPositionRulesSetsSchema`.
 */
export const ListSkillRulesSetsSchema = z.object({
  skillId: z.number().int(),
});

export type SkillCategory = z.infer<typeof SkillCategorySchema>;
export type SkillRulesSetEntry = z.infer<typeof SkillRulesSetEntrySchema>;
export type SyncSkillRulesSets = z.infer<typeof SyncSkillRulesSetsSchema>;
export type SyncSkillRulesSetsResult = z.infer<
  typeof SyncSkillRulesSetsResultSchema
>;
export type SkillRulesSetCategory = z.infer<typeof SkillRulesSetCategorySchema>;
export type ListSkillRulesSets = z.infer<typeof ListSkillRulesSetsSchema>;
