import { z } from 'zod';

/**
 * One position's characteristics under one rules set.
 *
 * `passing` is required but nullable, not optional: `null` means "this rules
 * set has no Passing characteristic" and is a real, asserted state, so an
 * omitted value would be an authoring mistake rather than a third meaning —
 * the same reasoning as `raceId` on SppAwardValueEntrySchema. The server
 * rejects any entry whose values disagree with the rules set's declared
 * characteristic formats.
 */
export const PositionRulesSetEntrySchema = z.object({
  positionId: z.number().int(),
  rulesSetId: z.number().int(),
  move: z.number().int(),
  strength: z.number().int(),
  agility: z.number().int(),
  passing: z.number().int().nullable(),
  armour: z.number().int(),
});

/**
 * Not an upsert: a position/rules-set row has no external ids — its natural
 * key is the (position, rules set) pair — so there is no entity+created shape
 * to return and no external-id conflict to detect, the same reason
 * `sppAwardValues.sync` and `positions.syncRaceEras` are sync procedures.
 */
export const SyncPositionRulesSetsSchema = z.object({
  entries: z.array(PositionRulesSetEntrySchema),
});

export const SyncPositionRulesSetsResultSchema = z.object({
  positionRulesSetIds: z.array(z.number()),
});

export type PositionRulesSetEntry = z.infer<typeof PositionRulesSetEntrySchema>;
export type SyncPositionRulesSets = z.infer<typeof SyncPositionRulesSetsSchema>;
export type SyncPositionRulesSetsResult = z.infer<
  typeof SyncPositionRulesSetsResultSchema
>;
