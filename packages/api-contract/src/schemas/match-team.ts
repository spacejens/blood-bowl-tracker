import { z } from 'zod';

export const MatchTeamSchema = z.object({
  matchId: z.number(),
  teamId: z.number(),
});

export const CreateMatchTeamSchema = z.object({
  matchId: z.number().int(),
  teamId: z.number().int(),
});

export type MatchTeam = z.infer<typeof MatchTeamSchema>;
export type CreateMatchTeam = z.infer<typeof CreateMatchTeamSchema>;
