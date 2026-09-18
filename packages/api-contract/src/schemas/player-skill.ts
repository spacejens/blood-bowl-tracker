import { PLAYER_SKILL_SOURCES } from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

/**
 * See `PLAYER_SKILL_SOURCES` in `@blood-bowl-tracker/domain-enums` for what
 * each source means and why starting and gained skills share one table.
 */
export const PlayerSkillSourceSchema = z.enum(PLAYER_SKILL_SOURCES);

/**
 * One skill one player has.
 *
 * Keyed by `(playerId, skillId, attributeValue)` — the same natural triple
 * the table is unique on. `attributeValue` is part of that key rather than a
 * plain attribute because BB2025's Hatred can be picked repeatedly against
 * different targets.
 *
 * `attributeValue` is `.nullable().optional()`, this contract's convention
 * for a DB-nullable field: a caller with no value can omit it entirely and
 * the stored column is genuinely `null`.
 *
 * `advancementOrder` is best-effort and unverified — neither BBL nor TP
 * records a confirmed sequence, only a presentation-order proxy — and is only
 * ever meaningful for a gained source (`advancement`, `chosen` or `random`).
 * A `starting` entry leaves it unset.
 */
export const PlayerSkillEntrySchema = z
  .object({
    playerId: z.number().int(),
    skillId: z.number().int(),
    source: PlayerSkillSourceSchema,
    attributeValue: z.string().nullable().optional(),
    advancementOrder: z.number().int().nonnegative().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.source === 'starting' &&
      typeof data.advancementOrder === 'number'
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'advancementOrder is only meaningful for chosen/random skills; a starting entry must leave it unset',
      });
    }
  });

/**
 * Not an upsert, for the same reason `positionRulesSets.sync` is not: the row
 * is keyed by its natural triple rather than external ids, so there is no
 * external-id conflict to detect and no entity+created shape to return.
 */
export const SyncPlayerSkillsSchema = z.object({
  entries: z.array(PlayerSkillEntrySchema),
});

export const SyncPlayerSkillsResultSchema = z.object({
  playerSkillIds: z.array(z.number()),
});

/**
 * One stored player skill as the read procedure returns it, without the
 * `playerId` the caller already supplied as input. Both nullable fields are
 * `nullable()` rather than optional here, matching the stored columns: the
 * read-back genuinely returns `null` for a skill with no variant and for a
 * starting skill, which has no sequence.
 */
export const PlayerSkillRefSchema = z.object({
  skillId: z.number().int(),
  source: PlayerSkillSourceSchema,
  attributeValue: z.string().nullable(),
  advancementOrder: z.number().int().nonnegative().nullable(),
});

/** Input of the read procedure: one player at a time. */
export const ListPlayerSkillsSchema = z.object({
  playerId: z.number().int(),
});

export type PlayerSkillSource = z.infer<typeof PlayerSkillSourceSchema>;
export type PlayerSkillEntry = z.infer<typeof PlayerSkillEntrySchema>;
export type SyncPlayerSkills = z.infer<typeof SyncPlayerSkillsSchema>;
export type SyncPlayerSkillsResult = z.infer<
  typeof SyncPlayerSkillsResultSchema
>;
export type PlayerSkillRef = z.infer<typeof PlayerSkillRefSchema>;
export type ListPlayerSkills = z.infer<typeof ListPlayerSkillsSchema>;
