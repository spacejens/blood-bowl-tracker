import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const TrophyRecipientKindSchema = z.enum(['team', 'player']);

export const TrophySchema = z.object({
  id: z.number(),
  name: z.string(),
  recipientKind: TrophyRecipientKindSchema,
  description: z.string().nullable(),
  competitionGroupId: z.number(),
  createdAt: z.coerce.date(),
});

/**
 * Unlike every other curated entity, `externalIds` is NOT `.min(1)` and
 * defaults to `[]`. A trophy can legitimately have no external id at all: TP's
 * own `awardType` codes are not globally unique per trophy, so seeding them
 * required scoping by competition group (issue #445) first. The curated
 * catalog (issue #446) now gives every trophy — including the TP-only
 * "Ogretoberfest" — an explicit external id, so no curated trophy currently
 * takes this path, but it stays supported for a future trophy that has no
 * source system to key on yet. `TrophiesService.upsert` matches such a trophy
 * by exact name instead, so an empty list stays idempotent across import runs.
 */
export const UpsertTrophySchema = z.object({
  name: z.string().min(1).optional(),
  recipientKind: TrophyRecipientKindSchema.optional(),
  // Nullable AND optional: omitting it leaves the stored description alone,
  // an explicit null clears it.
  description: z.string().nullable().optional(),
  // Optional like every other trophy field: an omitted value leaves the
  // stored group alone (overlay semantics), and on create the database's own
  // default applies. Real classification is curated in tools/import-manual.
  competitionGroupId: z.number().int().optional(),
  externalIds: z.array(ExternalIdSchema).default([]),
});

export type TrophyRecipientKind = z.infer<typeof TrophyRecipientKindSchema>;
export type Trophy = z.infer<typeof TrophySchema>;
export type UpsertTrophy = z.infer<typeof UpsertTrophySchema>;
