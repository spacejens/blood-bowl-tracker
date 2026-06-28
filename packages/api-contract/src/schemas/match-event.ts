import { z } from 'zod';

export const MatchEventSchema = z.object({
  id: z.number(),
  matchId: z.number(),
  type: z.string(),
  teamId: z.number(),
  playerId: z.number().nullable(),
  createdAt: z.date(),
});

export const CreateMatchEventSchema = z.object({
  matchId: z.number(),
  type: z.string().min(1),
  teamId: z.number(),
  playerId: z.number().optional(),
});

export type MatchEvent = z.infer<typeof MatchEventSchema>;
export type CreateMatchEvent = z.infer<typeof CreateMatchEventSchema>;
