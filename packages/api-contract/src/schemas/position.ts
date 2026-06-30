import { z } from 'zod';

export const PositionSchema = z.object({
  id: z.number(),
  name: z.string(),
  raceId: z.number(),
  createdAt: z.coerce.date(),
});

export const CreatePositionSchema = z.object({
  name: z.string().min(1),
  raceId: z.number().int(),
});

export type Position = z.infer<typeof PositionSchema>;
export type CreatePosition = z.infer<typeof CreatePositionSchema>;
