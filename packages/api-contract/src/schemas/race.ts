import { z } from 'zod';
import { ExternalIdSchema } from './external-id';

export const RaceSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.coerce.date(),
});

export const UpsertRaceSchema = z.object({
  name: z.string().min(1),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Race = z.infer<typeof RaceSchema>;
export type UpsertRace = z.infer<typeof UpsertRaceSchema>;
