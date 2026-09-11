import {
  ACTION_TYPES,
  CONSEQUENCE_TYPES,
  TROPHY_AWARD_RULE_KINDS,
  TROPHY_AWARD_RULE_MEASURES,
  TROPHY_AWARD_RULE_ROLES,
  TROPHY_RECIPIENT_KINDS,
} from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

import { ExternalIdSchema } from './external-id';
import { absent } from './shared/absent';

/**
 * See `TROPHY_RECIPIENT_KINDS` in `@blood-bowl-tracker/domain-enums` for what
 * each value means.
 */
export const TrophyRecipientKindSchema = z.enum(TROPHY_RECIPIENT_KINDS);

export const TrophyAwardRuleKindSchema = z.enum(TROPHY_AWARD_RULE_KINDS);
export const TrophyAwardRuleRoleSchema = z.enum(TROPHY_AWARD_RULE_ROLES);
export const TrophyAwardRuleMeasureSchema = z.enum(TROPHY_AWARD_RULE_MEASURES);

/**
 * One match-event type a computed trophy's rule counts. Exactly one of the two
 * fields is set — the database's own check constraint enforces the same rule
 * for the stored row, but that only rejects an invalid curated entry once it
 * reaches persistence, so the refinement below enforces it here too, at
 * validation time.
 */
export const TrophyAwardRuleEventTypeSchema = z
  .object({
    actionType: z.enum(ACTION_TYPES).nullish(),
    consequenceType: z.enum(CONSEQUENCE_TYPES).nullish(),
  })
  .refine((v) => !absent(v.actionType) !== !absent(v.consequenceType), {
    message: 'Exactly one of actionType/consequenceType must be set',
  });

export const TrophySchema = z.object({
  id: z.number(),
  name: z.string(),
  recipientKind: TrophyRecipientKindSchema,
  description: z.string().nullable(),
  competitionGroupId: z.number().nullable(),
  leagueId: z.number().nullable(),
  awardRuleKind: TrophyAwardRuleKindSchema,
  awardProcedure: z.string().nullable(),
  awardRuleRole: TrophyAwardRuleRoleSchema.nullable(),
  awardRuleTieCutoff: z.number().nullable(),
  awardRuleThreshold: z.number().nullable(),
  awardRuleMeasure: TrophyAwardRuleMeasureSchema.nullable(),
  createdAt: z.coerce.date(),
});

export const UpsertTrophySchema = z.object({
  name: z.string().min(1).optional(),
  recipientKind: TrophyRecipientKindSchema.optional(),
  // Nullable AND optional: omitting it leaves the stored description alone,
  // an explicit null clears it.
  description: z.string().nullable().optional(),
  // A trophy is scoped to exactly one of a competition group and a league.
  // Both are nullable AND optional, matching `description`'s overlay
  // semantics: omitting a field leaves the stored value alone, an explicit
  // null clears it — which is how a curated entry reclassifies a trophy from
  // group-scoped to league-scoped in a single upsert. Mutual exclusivity is
  // enforced by the database's own check constraint, not here.
  competitionGroupId: z.number().int().nullable().optional(),
  leagueId: z.number().int().nullable().optional(),
  awardRuleKind: TrophyAwardRuleKindSchema.optional(),
  awardProcedure: z.string().nullable().optional(),
  awardRuleRole: TrophyAwardRuleRoleSchema.nullable().optional(),
  awardRuleTieCutoff: z.number().int().nullable().optional(),
  awardRuleThreshold: z.number().int().nullable().optional(),
  awardRuleMeasure: TrophyAwardRuleMeasureSchema.nullable().optional(),
  // Supplying either array REPLACES that trophy's curated rows wholesale (an
  // empty array clears them); omitting it leaves them alone, matching how the
  // scalar fields above overlay rather than reset.
  awardRuleMatchEventTypes: z.array(TrophyAwardRuleEventTypeSchema).optional(),
  awardRuleExcludedMatchEventTypes: z
    .array(TrophyAwardRuleEventTypeSchema)
    .optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type TrophyRecipientKind = z.infer<typeof TrophyRecipientKindSchema>;
export type Trophy = z.infer<typeof TrophySchema>;
export type UpsertTrophy = z.infer<typeof UpsertTrophySchema>;
