import {
  PLAYER_CHARACTERISTICS,
  PLAYER_SKILL_SOURCES,
} from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

/**
 * See `PLAYER_SKILL_SOURCES` in `@blood-bowl-tracker/domain-enums` for what
 * each source means and why starting and gained skills share one table.
 */
export const PlayerSkillSourceSchema = z.enum(PLAYER_SKILL_SOURCES);

/** One of the five stat-line characteristics a player can raise. */
export const PlayerCharacteristicSchema = z.enum(PLAYER_CHARACTERISTICS);

/**
 * One advancement-relevant row one player has: either a skill or a
 * characteristic increase.
 *
 * A skill entry names `skillId` and is keyed by `(playerId, skillId,
 * attributeValue)`, the same natural triple the table's skill rows are unique
 * on. `attributeValue` is part of that key rather than a plain attribute
 * because BB2025's Hatred can be picked repeatedly against different targets.
 * It is `.nullable().optional()`, this contract's convention for a
 * DB-nullable field: a caller with no value can omit it entirely and the
 * stored column is genuinely `null`.
 *
 * A characteristic entry has `source: 'characteristic'` and names
 * `characteristic` instead of a skill, with no variant and never a free
 * extra. It is not keyed: a player can raise one characteristic more than
 * once, so the batch's increases for a player listed in
 * `characteristicPlayerIds` replace the stored ones as a whole.
 *
 * `advancementOrder` is one numbering shared by a player's skills and
 * characteristic increases, and is only ever meaningful for a gained entry; a
 * `starting` entry leaves it unset. `null` means the order is unknown. When it
 * is omitted, a new characteristic increase is appended after the player's
 * highest order, while a new skill stores `null`.
 *
 * `orderConfirmed` says `advancementOrder` is the player's real sequence
 * rather than a best-effort proxy (BBL's ordered advancement list, TP's array
 * position). It needs a numeric order. An unconfirmed order never overwrites
 * a confirmed one.
 *
 * `isFreeExtra` says the source system flags this gained skill as granted on
 * top of the player's advancements (TP's `isExtra`): it cost no SPP and is
 * not an advancement. Absent means false. The server also marks a skill as
 * free on its own (a skill one of the player's trophy awards grants, and
 * every non-`starting` Hatred), so a caller only sends what its source says.
 */
export const PlayerSkillEntrySchema = z
  .object({
    playerId: z.number().int(),
    skillId: z.number().int().optional(),
    characteristic: PlayerCharacteristicSchema.optional(),
    source: PlayerSkillSourceSchema,
    attributeValue: z.string().nullable().optional(),
    advancementOrder: z.number().int().nonnegative().nullable().optional(),
    orderConfirmed: z.boolean().optional(),
    isFreeExtra: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const issue = (message: string): void => {
      ctx.addIssue({ code: 'custom', message });
    };
    const isCharacteristic = data.source === 'characteristic';
    if (isCharacteristic !== (data.characteristic !== undefined)) {
      issue('characteristic is required exactly when source is characteristic');
    }
    if ((data.skillId === undefined) === (data.characteristic === undefined)) {
      issue('An entry names exactly one of skillId or characteristic');
    }
    if (isCharacteristic && (data.attributeValue ?? null) !== null) {
      issue('A characteristic entry has no attributeValue');
    }
    if (isCharacteristic && data.isFreeExtra === true) {
      issue('A characteristic increase is never a free extra');
    }
    if (
      data.source === 'starting' &&
      typeof data.advancementOrder === 'number'
    ) {
      issue(
        'advancementOrder is only meaningful for a gained entry; a starting entry must leave it unset',
      );
    }
    if (
      data.orderConfirmed === true &&
      typeof data.advancementOrder !== 'number'
    ) {
      issue('orderConfirmed needs a numeric advancementOrder');
    }
  });

/**
 * Not an upsert, for the same reason `positionRulesSets.sync` is not: the row
 * is keyed by its natural triple rather than external ids, so there is no
 * external-id conflict to detect and no entity+created shape to return.
 */
export const SyncPlayerSkillsSchema = z.object({
  entries: z.array(PlayerSkillEntrySchema),
  /**
   * The players whose characteristic increases `entries` states in full. Each
   * one's stored increase rows are reconciled to the batch, so listing a
   * player with no characteristic entries means "no increases". A player not
   * listed keeps their stored increase rows, and a characteristic entry for a
   * player not listed is rejected.
   */
  characteristicPlayerIds: z.array(z.number().int()).optional(),
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
 *
 * `isFreeExtra` is the stored flag, always present on a read-back row.
 */
export const PlayerSkillRefSchema = z.object({
  skillId: z.number().int(),
  source: PlayerSkillSourceSchema,
  attributeValue: z.string().nullable(),
  advancementOrder: z.number().int().nonnegative().nullable(),
  isFreeExtra: z.boolean(),
});

/**
 * Input of the read procedure: one player at a time, read under one rules set.
 * The rules set scopes the skill categories and elite flags the service joins
 * in — which the output schema does not carry, for the same reason it does not
 * carry the skill's name: they describe `skill_rules_sets`, not the stored
 * `player_advancements` row this procedure reads back.
 */
export const ListPlayerSkillsSchema = z.object({
  playerId: z.number().int(),
  rulesSetId: z.number().int(),
});

export type PlayerSkillEntry = z.infer<typeof PlayerSkillEntrySchema>;
export type SyncPlayerSkills = z.infer<typeof SyncPlayerSkillsSchema>;
export type SyncPlayerSkillsResult = z.infer<
  typeof SyncPlayerSkillsResultSchema
>;
export type PlayerSkillRef = z.infer<typeof PlayerSkillRefSchema>;
export type ListPlayerSkills = z.infer<typeof ListPlayerSkillsSchema>;
