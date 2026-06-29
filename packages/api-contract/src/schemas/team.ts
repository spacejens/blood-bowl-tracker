import { z } from 'zod';

export const TeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  raceId: z.number(),
  coachId: z.number(),
  createdAt: z.coerce.date(),
});

export const CreateTeamSchema = z.object({
  name: z.string().min(1),
  raceId: z.number().int(),
  coachId: z.number().int(),
});

export type Team = z.infer<typeof TeamSchema>;
export type CreateTeam = z.infer<typeof CreateTeamSchema>;
