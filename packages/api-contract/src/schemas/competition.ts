import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const CompetitionSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(['season', 'cup']),
  eraId: z.number(),
  teamEraIds: z.array(z.number()),
  createdAt: z.coerce.date(),
});

export const UpsertCompetitionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['season', 'cup']),
  eraId: z.number().int(),
  teamEraIds: z.array(z.number().int()).default([]),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Competition = z.infer<typeof CompetitionSchema>;
export type UpsertCompetition = z.infer<typeof UpsertCompetitionSchema>;
