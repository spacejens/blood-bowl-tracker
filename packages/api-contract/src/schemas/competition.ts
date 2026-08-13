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
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const UpsertCompetitionSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['season', 'cup']).optional(),
  eraId: z.number().int().optional(),
  teamEraIds: z.array(z.number().int()).default([]),
  // Nullable AND optional: omitting a date leaves the stored value alone,
  // an explicit null clears it. Both dates are nullable (unlike era's
  // required startDate) because a competition's end date is not always
  // derivable, and pre-existing rows may still be unpopulated; #434 tightens
  // startDate to NOT NULL once every importer supplies it.
  startDate: IsoDate.nullable().optional(),
  endDate: IsoDate.nullable().optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Competition = z.infer<typeof CompetitionSchema>;
export type UpsertCompetition = z.infer<typeof UpsertCompetitionSchema>;
