import { z } from 'zod';

/**
 * One starting skill of a position under one rules set.
 *
 * Keyed by `(positionId, rulesSetId, skillId)` at the API boundary rather
 * than by the stored `position_rules_sets.id`: callers hold position and
 * rules-set ids from their own upserts, never the internal association id.
 * The server resolves the association row itself and rejects an entry whose
 * position/rules-set pair has no characteristics recorded yet.
 *
 * `attributeValue` carries a position-specific variant of the skill that is
 * no longer part of the skill's own identity — e.g. "Loner (4+)"'s "4+", or
 * "Animosity (Orc Linemen)"'s "Orc Linemen" — now that skill identity is just
 * the base name. It is optional because most starting skills carry no such
 * detail at all.
 */
export const PositionRulesSetSkillEntrySchema = z.object({
  positionId: z.number().int(),
  rulesSetId: z.number().int(),
  skillId: z.number().int(),
  attributeValue: z.string().optional(),
});

/**
 * Not an upsert, for the same reason `positionRulesSets.sync` is not: the row
 * is keyed by its natural triple rather than external ids, so there is no
 * external-id conflict to detect and no entity+created shape to return.
 */
export const SyncPositionRulesSetSkillsSchema = z.object({
  entries: z.array(PositionRulesSetSkillEntrySchema),
});

export const SyncPositionRulesSetSkillsResultSchema = z.object({
  positionRulesSetSkillIds: z.array(z.number()),
});

/**
 * One stored starting skill as the read procedure returns it, without the
 * `positionId` the caller already supplied as input.
 *
 * `attributeValue` carries a position-specific variant of the skill that is
 * no longer part of the skill's own identity — e.g. "Loner (4+)"'s "4+", or
 * "Animosity (Orc Linemen)"'s "Orc Linemen" — now that skill identity is just
 * the base name. It is optional because most starting skills carry no such
 * detail at all.
 */
export const PositionRulesSetSkillRefSchema = z.object({
  rulesSetId: z.number().int(),
  skillId: z.number().int(),
  attributeValue: z.string().optional(),
});

/** Input of the read procedure: one position at a time. */
export const ListPositionRulesSetSkillsSchema = z.object({
  positionId: z.number().int(),
});

export type PositionRulesSetSkillEntry = z.infer<
  typeof PositionRulesSetSkillEntrySchema
>;
export type SyncPositionRulesSetSkills = z.infer<
  typeof SyncPositionRulesSetSkillsSchema
>;
export type SyncPositionRulesSetSkillsResult = z.infer<
  typeof SyncPositionRulesSetSkillsResultSchema
>;
export type PositionRulesSetSkillRef = z.infer<
  typeof PositionRulesSetSkillRefSchema
>;
export type ListPositionRulesSetSkills = z.infer<
  typeof ListPositionRulesSetSkillsSchema
>;
