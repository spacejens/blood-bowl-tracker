import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

export const EraSchema = z.object({
  id: z.number(),
  name: z.string(),
  leagueId: z.number(),
  rulesSetIds: z.array(z.number()),
  startDate: z.string(),
  endDate: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const UpsertEraSchema = z.object({
  name: z.string().min(1),
  leagueId: z.number().int(),
  rulesSetIds: z.array(z.number().int()).min(1),
  startDate: IsoDate,
  endDate: IsoDate.optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Era = z.infer<typeof EraSchema>;
export type UpsertEra = z.infer<typeof UpsertEraSchema>;
