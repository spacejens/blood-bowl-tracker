import { z } from 'zod';
import { ExternalIdSchema } from './external-id';

export const CoachSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.coerce.date(),
});

export const UpsertCoachSchema = z.object({
  name: z.string().min(1),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Coach = z.infer<typeof CoachSchema>;
export type UpsertCoach = z.infer<typeof UpsertCoachSchema>;
