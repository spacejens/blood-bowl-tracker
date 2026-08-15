import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

export const CompetitionSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(['season', 'cup']),
  eraId: z.number(),
  teamEraIds: z.array(z.number()),
  startDate: z.string(),
  endDate: z.string().nullable(),
  competitionGroupId: z.number(),
  createdAt: z.coerce.date(),
});

export const UpsertCompetitionSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['season', 'cup']).optional(),
  eraId: z.number().int().optional(),
  teamEraIds: z.array(z.number().int()).default([]),
  // startDate is optional but not nullable: omitting it on an update leaves
  // the stored value alone, but a required column can never be cleared to
  // null. endDate stays nullable AND optional — omitting it leaves the
  // stored value alone, an explicit null clears it — because a competition's
  // end date is not always derivable.
  startDate: IsoDate.optional(),
  endDate: IsoDate.nullable().optional(),
  // Optional like every other competition field: an omitted value leaves the
  // stored group alone (overlay semantics), and on create the database's own
  // default applies. Real classification is curated in tools/import-manual.
  competitionGroupId: z.number().int().optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Competition = z.infer<typeof CompetitionSchema>;
export type UpsertCompetition = z.infer<typeof UpsertCompetitionSchema>;
