import { PLAYER_STATUSES } from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

import { PlayerCharacteristicSchema } from './player-skill';

/**
 * The player's complete current characteristic line. MA, ST, AG and AV are
 * positive: a zero is the placeholder that marks the player incomplete.
 * `passing` is null for a rules set without Passing and may be 0 (TP's "-")
 * otherwise; the server checks which against the player's era rules sets.
 */
const FillCharacteristicsSchema = z.object({
  move: z.number().int().positive(),
  strength: z.number().int().positive(),
  agility: z.number().int().positive(),
  passing: z.number().int().nonnegative().nullable(),
  armour: z.number().int().positive(),
});

/** One starting skill, with the variant its row carries (null for none). */
const FillStartingSkillSchema = z.object({
  skillId: z.number().int(),
  attributeValue: z.string().min(1).nullable(),
});

/**
 * One advancement, in the order taken: a gained skill (`advancement` when
 * the source does not say whether it was chosen or rolled) or a
 * characteristic increase.
 */
export const FillAdvancementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('skill'),
    skillId: z.number().int(),
    attributeValue: z.string().min(1).nullable(),
    source: z.enum(['advancement', 'chosen', 'random']),
    isFreeExtra: z.boolean(),
  }),
  z.object({
    kind: z.literal('characteristic'),
    characteristic: PlayerCharacteristicSchema,
  }),
]);

/**
 * Everything `/debugincompleteimport` needs to stop counting one existing TP
 * player, supplied in full by a manual import batch. All fields are
 * required, so a fill is never partial. The server writes it only to a
 * non-star TP player still counted as incomplete, and only when nothing
 * stored contradicts it; see `players.fillIncomplete`.
 */
export const FillIncompletePlayerSchema = z.object({
  playerId: z.number().int(),
  status: z.enum(PLAYER_STATUSES),
  characteristics: FillCharacteristicsSchema,
  sppTotal: z.number().int().nonnegative(),
  unspentSpp: z.number().int().nonnegative(),
  startingSkills: z.array(FillStartingSkillSchema),
  advancements: z.array(FillAdvancementSchema),
});

/**
 * `filled` when this call wrote the player; `unchanged` when he was already
 * complete with exactly this data (a batch re-run), so nothing was written.
 */
export const FillIncompletePlayerResultSchema = z.object({
  playerId: z.number().int(),
  outcome: z.enum(['filled', 'unchanged']),
});

export type FillAdvancement = z.infer<typeof FillAdvancementSchema>;
export type FillIncompletePlayer = z.infer<typeof FillIncompletePlayerSchema>;
export type FillIncompletePlayerResult = z.infer<
  typeof FillIncompletePlayerResultSchema
>;
