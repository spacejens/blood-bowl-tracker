import { z } from 'zod';

export const RaceSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.coerce.date(),
});

export const CreateRaceSchema = z.object({
  name: z.string().min(1),
});

export type Race = z.infer<typeof RaceSchema>;
export type CreateRace = z.infer<typeof CreateRaceSchema>;
