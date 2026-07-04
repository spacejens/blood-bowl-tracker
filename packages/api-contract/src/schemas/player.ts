import { z } from 'zod';

export const PlayerSchema = z.object({
  id: z.number(),
  name: z.string(),
  teamEraId: z.number(),
  positionId: z.number(),
  createdAt: z.coerce.date(),
});

export const CreatePlayerSchema = z.object({
  name: z.string().min(1),
  teamEraId: z.number().int(),
  positionId: z.number().int(),
});

export type Player = z.infer<typeof PlayerSchema>;
export type CreatePlayer = z.infer<typeof CreatePlayerSchema>;
