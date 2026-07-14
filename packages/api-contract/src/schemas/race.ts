import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const RaceSchema = z.object({
  id: z.number(),
  name: z.string(),
  eras: z.array(z.number()),
  createdAt: z.coerce.date(),
});

export const UpsertRaceSchema = z.object({
  name: z.string().min(1),
  eras: z.array(z.number().int()).default([]),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Race = z.infer<typeof RaceSchema>;
export type UpsertRace = z.infer<typeof UpsertRaceSchema>;
