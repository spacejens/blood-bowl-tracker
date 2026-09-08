import { ACTION_TYPES } from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

/**
 * The action types that can earn Star Player Points, and therefore the only
 * ones `spp_award_values` ever holds a row for. A deliberate, curated subset
 * of `ACTION_TYPES` rather than a mirror of it: `foul` earns no SPP (Blood
 * Bowl gives no credit for a foul) and no administrative type has an acting
 * player to award.
 *
 * Every casualty-caused severity is listed separately because the shared enum
 * models them separately, but they always carry the same value — "a casualty
 * was caused" is one award in the rules.
 *
 * `satisfies readonly (typeof ACTION_TYPES)[number][]` is what keeps the
 * subset honest: a typo here, or an action type renamed or removed from
 * `@blood-bowl-tracker/domain-enums`, fails to compile instead of silently
 * drifting. It is `satisfies` rather than a type annotation so the literal
 * tuple type survives for `z.enum`.
 */
const SPP_EARNING_ACTION_TYPES = [
  'touchdown',
  'completion',
  'interception',
  'deflection',
  'mvp_award',
  'casualty',
  'badly_hurt',
  'serious_injury',
  'death',
] as const satisfies readonly (typeof ACTION_TYPES)[number][];

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

export type SppEarningActionType = z.infer<typeof SppEarningActionTypeSchema>;
export type SppAwardValueEntry = z.infer<typeof SppAwardValueEntrySchema>;
export type SyncSppAwardValues = z.infer<typeof SyncSppAwardValuesSchema>;
export type SyncSppAwardValuesResult = z.infer<
  typeof SyncSppAwardValuesResultSchema
>;
