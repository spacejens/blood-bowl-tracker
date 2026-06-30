import { z } from 'zod';

export const LeagueSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.coerce.date(),
});

export const CreateLeagueSchema = z.object({
  name: z.string().min(1),
});

export type League = z.infer<typeof LeagueSchema>;
export type CreateLeague = z.infer<typeof CreateLeagueSchema>;
