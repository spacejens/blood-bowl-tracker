import { z } from 'zod';

export const MatchSchema = z.object({
  id: z.number(),
  competitionId: z.number(),
  playedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export const CreateMatchSchema = z.object({
  competitionId: z.number().int(),
  playedAt: z.coerce.date(),
});

export type Match = z.infer<typeof MatchSchema>;
export type CreateMatch = z.infer<typeof CreateMatchSchema>;
