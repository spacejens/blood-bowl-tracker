import { z } from 'zod';

export const TeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  race: z.string(),
  coach: z.string(),
  createdAt: z.date(),
});

export const CreateTeamSchema = z.object({
  name: z.string().min(1),
  race: z.string().min(1),
  coach: z.string().min(1),
});

export type Team = z.infer<typeof TeamSchema>;
export type CreateTeam = z.infer<typeof CreateTeamSchema>;
