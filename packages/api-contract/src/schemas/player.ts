import { z } from 'zod';

export const PlayerSchema = z.object({
  id: z.number(),
  name: z.string(),
  teamId: z.number(),
  positionId: z.number(),
  createdAt: z.coerce.date(),
});

export const CreatePlayerSchema = z.object({
  name: z.string().min(1),
  teamId: z.number().int(),
  positionId: z.number().int(),
});

export type Player = z.infer<typeof PlayerSchema>;
export type CreatePlayer = z.infer<typeof CreatePlayerSchema>;
