import { z } from 'zod';

export const MatchEventSchema = z.object({
  id: z.number(),
  matchId: z.number(),
  actingTeamEraId: z.number().nullable(),
  consequenceTeamEraId: z.number().nullable(),
  actingPlayerId: z.number().nullable(),
  consequencePlayerId: z.number().nullable(),
  createdAt: z.coerce.date(),
});

export const CreateMatchEventSchema = z.object({
  matchId: z.number(),
  actingTeamEraId: z.number().int().optional(),
  consequenceTeamEraId: z.number().int().optional(),
  actingPlayerId: z.number().int().optional(),
  consequencePlayerId: z.number().int().optional(),
});

export type MatchEvent = z.infer<typeof MatchEventSchema>;
export type CreateMatchEvent = z.infer<typeof CreateMatchEventSchema>;
