import { TROPHY_RECIPIENT_KINDS } from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

/**
 * See `TROPHY_RECIPIENT_KINDS` in `@blood-bowl-tracker/domain-enums` for what
 * each value means.
 */
export const TrophyRecipientKindSchema = z.enum(TROPHY_RECIPIENT_KINDS);

export const TrophySchema = z.object({
  id: z.number(),
  name: z.string(),
  recipientKind: TrophyRecipientKindSchema,
  description: z.string().nullable(),
  competitionGroupId: z.number().nullable(),
  leagueId: z.number().nullable(),
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
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type TrophyRecipientKind = z.infer<typeof TrophyRecipientKindSchema>;
export type Trophy = z.infer<typeof TrophySchema>;
export type UpsertTrophy = z.infer<typeof UpsertTrophySchema>;
