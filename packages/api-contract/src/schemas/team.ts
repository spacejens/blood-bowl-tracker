import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const TeamEraSchema = z.object({
  id: z.number(),
  eraId: z.number(),
});

export const TeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  raceId: z.number(),
  coachId: z.number(),
  eras: z.array(TeamEraSchema),
  createdAt: z.coerce.date(),
});

export const UpsertTeamSchema = z.object({
  name: z.string().min(1),
  raceId: z.number().int(),
  coachId: z.number().int(),
  eras: z.array(z.number().int()).default([]),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type TeamEra = z.infer<typeof TeamEraSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type UpsertTeam = z.infer<typeof UpsertTeamSchema>;
