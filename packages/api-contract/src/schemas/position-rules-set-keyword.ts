import { z } from 'zod';

import { KeywordKindSchema } from './keyword';

/**
 * One BB2025 keyword a position carries under one rules set.
 *
 * Keyed by `(positionId, rulesSetId, keywordId)` at the API boundary rather
 * than by the stored `position_rules_sets.id`, exactly as
 * `positionRulesSetSkills` is: callers hold position and rules-set ids from
 * their own upserts, never the internal association id. The server resolves
 * that row itself and rejects an entry whose position/rules-set pair has no
 * characteristics recorded yet.
 */
export const PositionRulesSetKeywordEntrySchema = z.object({
  positionId: z.number().int(),
  rulesSetId: z.number().int(),
  keywordId: z.number().int(),
});

/**
 * Not an upsert, for the same reason `positionRulesSets.sync` is not: the row
 * is keyed by its natural triple rather than external ids, so there is no
 * external-id conflict to detect and no entity+created shape to return.
 */
export const SyncPositionRulesSetKeywordsSchema = z.object({
  entries: z.array(PositionRulesSetKeywordEntrySchema),
});

export const SyncPositionRulesSetKeywordsResultSchema = z.object({
  positionRulesSetKeywordIds: z.array(z.number()),
});

/**
 * One stored keyword as the read procedure returns it, without the
 * `positionId` the caller already supplied. The name and kind come along
 * because every caller wants to display the keyword, and a second round trip
 * to name it would be pure overhead for a 48-row catalogue.
 */
export const PositionRulesSetKeywordRefSchema = z.object({
  rulesSetId: z.number().int(),
  keywordId: z.number().int(),
  // Named `keywordName`, not `name`, so it matches the column name
  // PositionRulesSetKeywordsService.listByPosition already selects -- the
  // handler then passes its rows straight through with no mapping step.
  keywordName: z.string(),
  kind: KeywordKindSchema,
});

export const ListPositionRulesSetKeywordsSchema = z.object({
  positionId: z.number().int(),
});

export type PositionRulesSetKeywordEntry = z.infer<
  typeof PositionRulesSetKeywordEntrySchema
>;
export type SyncPositionRulesSetKeywords = z.infer<
  typeof SyncPositionRulesSetKeywordsSchema
>;
export type SyncPositionRulesSetKeywordsResult = z.infer<
  typeof SyncPositionRulesSetKeywordsResultSchema
>;
export type PositionRulesSetKeywordRef = z.infer<
  typeof PositionRulesSetKeywordRefSchema
>;
export type ListPositionRulesSetKeywords = z.infer<
  typeof ListPositionRulesSetKeywordsSchema
>;
