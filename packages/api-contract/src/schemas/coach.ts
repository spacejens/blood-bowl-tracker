import { z } from 'zod';

export const CoachSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.coerce.date(),
});

export const CreateCoachSchema = z.object({
  name: z.string().min(1),
});

export const UpsertCoachExternalIdSchema = z.object({
  externalSystemId: z.number().int(),
  externalId: z.string().min(1),
});

export const UpsertCoachSchema = z.object({
  name: z.string().min(1),
  externalIds: z.array(UpsertCoachExternalIdSchema).min(1),
});

export type Coach = z.infer<typeof CoachSchema>;
export type CreateCoach = z.infer<typeof CreateCoachSchema>;
export type UpsertCoachExternalId = z.infer<typeof UpsertCoachExternalIdSchema>;
export type UpsertCoach = z.infer<typeof UpsertCoachSchema>;
