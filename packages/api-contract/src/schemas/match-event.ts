import { z } from 'zod';

export const MatchEventSchema = z.object({
  id: z.number(),
  matchId: z.number(),
  actingTeamId: z.number().nullable(),
  consequenceTeamId: z.number().nullable(),
  actingPlayerId: z.number().nullable(),
  consequencePlayerId: z.number().nullable(),
  createdAt: z.coerce.date(),
});

export const CreateMatchEventSchema = z.object({
  matchId: z.number(),
  actingTeamId: z.number().int().optional(),
  consequenceTeamId: z.number().int().optional(),
  actingPlayerId: z.number().int().optional(),
  consequencePlayerId: z.number().int().optional(),
});

export type MatchEvent = z.infer<typeof MatchEventSchema>;
export type CreateMatchEvent = z.infer<typeof CreateMatchEventSchema>;
