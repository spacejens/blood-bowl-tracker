import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const MatchSchema = z.object({
  id: z.number(),
  competitionId: z.number(),
  teamEraIds: z.array(z.number()),
  name: z.string(),
  playedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export const UpsertMatchSchema = z.object({
  competitionId: z.number().int(),
  playedAt: z.date(),
  name: z.string().min(1),
  externalIds: z.array(ExternalIdSchema).min(1),
  teamEraIds: z.array(z.number().int()).default([]),
});

export type Match = z.infer<typeof MatchSchema>;
export type UpsertMatch = z.infer<typeof UpsertMatchSchema>;
