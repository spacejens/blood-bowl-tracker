import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const LeagueSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.coerce.date(),
});

export const UpsertLeagueSchema = z.object({
  name: z.string().min(1).optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type League = z.infer<typeof LeagueSchema>;
export type UpsertLeague = z.infer<typeof UpsertLeagueSchema>;
