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
  name: z.string().min(1).optional(),
  leagueId: z.number().int().optional(),
  // Additive: syncRulesSets only ever inserts missing links, so an omitted
  // list (parsed to []) is a no-op that leaves existing links alone. The
  // former .min(1) would have forced a rename-only payload to redeclare the
  // whole list.
  rulesSetIds: z.array(z.number().int()).default([]),
  startDate: IsoDate.optional(),
  // Nullable AND optional: omitting it leaves a stored end date alone, while
  // an explicit null clears it.
  endDate: IsoDate.nullable().optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Era = z.infer<typeof EraSchema>;
export type UpsertEra = z.infer<typeof UpsertEraSchema>;
