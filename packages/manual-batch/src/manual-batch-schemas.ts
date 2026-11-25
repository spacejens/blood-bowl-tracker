import {
  PlayerCharacteristicSchema,
  PlayerSkillSourceSchema,
} from '@blood-bowl-tracker/api-contract';
import {
  PLAYER_STATUSES,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

/** An external-id pair, both in an entry's own externalIds and in a
 * cross-reference to another entry. `system` is an external system name;
 * `id` follows the id:/name: namespacing convention. */
export const ExternalRefSchema = z.object({
  system: z.string().min(1),
  id: z.string().min(1),
});

/**
 * A starting skill whose value (e.g. "4+" for Loner, "+1" for Mighty Blow) is
 * specific to this position rather than part of the skill's own identity --
 * the skill itself is one deduplicated row (e.g. "Loner"), and each position
 * that grants it carries its own attributeValue here.
 */
const PositionRulesSetSkillWithAttributeSchema = z.object({
  skill: ExternalRefSchema,
  attributeValue: z.string().min(1),
});

/**
 * One item in a position's starting-skill list: either a bare skill
 * reference (the common case, no position-specific value), or the wrapped
 * form above carrying an attributeValue alongside the reference.
 */
export const PositionRulesSetSkillRefSchema = z.union([
  ExternalRefSchema,
  PositionRulesSetSkillWithAttributeSchema,
]);

/**
 * The complete current characteristic line of a player being filled in. MA,
 * ST, AG and AV are positive, since a zero is what marks him incomplete; PA
 * may be 0 ("-") and is left out under a rules set with no Passing.
 */
const IncompletePlayerFillCharacteristicsSchema = z
  .object({
    ma: z.number().int().positive(),
    st: z.number().int().positive(),
    ag: z.number().int().positive(),
    pa: z.number().int().nonnegative().optional(),
    av: z.number().int().positive(),
  })
  .strict();

/**
 * One advancement of a player being filled in, first taken first: a skill
 * (with its variant, whether it was chosen or random when known, and whether
 * it is a free extra) or a characteristic increase.
 */
const IncompletePlayerFillAdvancementSchema = z.union([
  z
    .object({
      skill: ExternalRefSchema,
      attributeValue: z.string().min(1).optional(),
      source: PlayerSkillSourceSchema.extract(['chosen', 'random']).optional(),
      freeExtra: z.boolean().optional(),
    })
    .strict(),
  z.object({ characteristic: PlayerCharacteristicSchema }).strict(),
]);

/**
 * The complete data of one TP player the TP import left incomplete. Every
 * field but `journeyman` is required, so an entry is never partial. See
 * docs/import-manual/filling-missing-players.md.
 */
export const IncompletePlayerFillEntrySchema = z.object({
  player: z.object({
    system: z.literal(TP_EXTERNAL_SYSTEM_NAME),
    id: z.string().min(1),
  }),
  status: z.enum(PLAYER_STATUSES),
  characteristics: IncompletePlayerFillCharacteristicsSchema,
  sppTotal: z.number().int().nonnegative(),
  unspentSpp: z.number().int().nonnegative(),
  startingSkills: z.array(PositionRulesSetSkillRefSchema),
  advancements: z.array(IncompletePlayerFillAdvancementSchema),
  /** A journeyman whose stored marker is set; see filling-missing-players.md. */
  journeyman: z.literal(true).optional(),
});

/**
 * A TP player no longer incomplete whose lasting stat reductions the server
 * derives from his stored data and records when none are stored. It carries
 * no counts. See docs/import-manual/filling-missing-players.md.
 */
export const LastingInjuryRepairEntrySchema = z
  .object({
    player: z.object({
      system: z.literal(TP_EXTERNAL_SYSTEM_NAME),
      id: z.string().min(1),
    }),
  })
  .strict();

export type ExternalRef = z.infer<typeof ExternalRefSchema>;
export type PositionRulesSetSkillRef = z.infer<
  typeof PositionRulesSetSkillRefSchema
>;
export type IncompletePlayerFillEntry = z.infer<
  typeof IncompletePlayerFillEntrySchema
>;
export type LastingInjuryRepairEntry = z.infer<
  typeof LastingInjuryRepairEntrySchema
>;
