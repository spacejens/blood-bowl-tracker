import { SPP_EARNING_ACTION_TYPES } from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

/**
 * See `SPP_EARNING_ACTION_TYPES` in `@blood-bowl-tracker/domain-enums` for
 * which action types earn SPP and why.
 */
export const SppEarningActionTypeSchema = z.enum(SPP_EARNING_ACTION_TYPES);

/**
 * One award-table row. `raceId` is required but nullable, and the two states
 * mean genuinely different things: `null` is the rules set's baseline for
 * that action type, a number overrides the baseline for that one race. It is
 * therefore not `.optional()` — an omitted raceId would be an authoring
 * mistake, not a third meaning.
 */
export const SppAwardValueEntrySchema = z.object({
  rulesSetId: z.number().int(),
  raceId: z.number().int().nullable(),
  actionType: SppEarningActionTypeSchema,
  sppValue: z.number().int(),
});

/**
 * Not an upsert: award values have no external ids to match on (their natural
 * key is the rules set / race / action type triple), so there is no
 * entity+created shape to return and no external-id conflict to detect —
 * the same reason `positions.syncRaceEras` is its own procedure.
 */
export const SyncSppAwardValuesSchema = z.object({
  values: z.array(SppAwardValueEntrySchema),
});

export const SyncSppAwardValuesResultSchema = z.object({
  sppAwardValueIds: z.array(z.number()),
});

export type SppAwardValueEntry = z.infer<typeof SppAwardValueEntrySchema>;
export type SyncSppAwardValues = z.infer<typeof SyncSppAwardValuesSchema>;
export type SyncSppAwardValuesResult = z.infer<
  typeof SyncSppAwardValuesResultSchema
>;
