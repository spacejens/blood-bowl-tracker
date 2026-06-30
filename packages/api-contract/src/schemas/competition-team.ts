import { z } from 'zod';

export const CompetitionTeamSchema = z.object({
  competitionId: z.number(),
  teamId: z.number(),
});

export const CreateCompetitionTeamSchema = z.object({
  competitionId: z.number().int(),
  teamId: z.number().int(),
});

export type CompetitionTeam = z.infer<typeof CompetitionTeamSchema>;
export type CreateCompetitionTeam = z.infer<typeof CreateCompetitionTeamSchema>;
