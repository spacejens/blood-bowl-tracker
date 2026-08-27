import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

/**
 * Every competition type, in the same order as `game_data.competition_type`
 * (packages/db). Exported as a tuple so consumers can iterate the values as
 * well as use the inferred union type.
 */
export const COMPETITION_TYPES = ['season', 'cup'] as const;

export type CompetitionType = (typeof COMPETITION_TYPES)[number];

export const CompetitionSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(COMPETITION_TYPES),
  eraId: z.number(),
  teamEraIds: z.array(z.number()),
  startDate: z.string(),
  endDate: z.string().nullable(),
  competitionGroupId: z.number(),
  createdAt: z.coerce.date(),
});

export const UpsertCompetitionSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(COMPETITION_TYPES).optional(),
  eraId: z.number().int().optional(),
  teamEraIds: z.array(z.number().int()).default([]),
  // startDate is optional but not nullable: omitting it on an update leaves
  // the stored value alone, but a required column can never be cleared to
  // null. endDate stays nullable AND optional — omitting it leaves the
  // stored value alone, an explicit null clears it — because a competition's
  // end date is not always derivable.
  startDate: IsoDate.optional(),
  endDate: IsoDate.nullable().optional(),
  // Optional in this Zod schema for update's overlay semantics: an omitted
  // value on update leaves the stored group alone. On create it is now
  // effectively required — the column is NOT NULL with no database default,
  // so an omitted value on create throws MissingRequiredFieldError. Real
  // classification is curated in tools/import-manual.
  competitionGroupId: z.number().int().optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Competition = z.infer<typeof CompetitionSchema>;
export type UpsertCompetition = z.infer<typeof UpsertCompetitionSchema>;
