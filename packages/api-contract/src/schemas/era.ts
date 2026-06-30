import { z } from 'zod';

export const EraSchema = z.object({
  id: z.number(),
  name: z.string(),
  leagueId: z.number(),
  rulesSetId: z.number(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const CreateEraSchema = z.object({
  name: z.string().min(1),
  leagueId: z.number().int(),
  rulesSetId: z.number().int(),
  startDate: z.string(),
  endDate: z.string().optional(),
});

export type Era = z.infer<typeof EraSchema>;
export type CreateEra = z.infer<typeof CreateEraSchema>;
