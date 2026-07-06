import { z } from 'zod';

export const TeamEraSchema = z.object({
  id: z.number(),
  teamId: z.number(),
  eraId: z.number(),
  createdAt: z.coerce.date(),
});

export const CreateTeamEraSchema = z.object({
  teamId: z.number().int(),
  eraId: z.number().int(),
});
