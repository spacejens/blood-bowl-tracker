import { z } from 'zod';

export const MatchSchema = z.object({
  id: z.number(),
  homeTeamId: z.number(),
  awayTeamId: z.number(),
  playedAt: z.date(),
  createdAt: z.date(),
});

export const CreateMatchSchema = z.object({
  homeTeamId: z.number(),
  awayTeamId: z.number(),
  playedAt: z.date(),
});

export type Match = z.infer<typeof MatchSchema>;
export type CreateMatch = z.infer<typeof CreateMatchSchema>;
