import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const RulesSetSchema = z.object({
  id: z.number(),
  name: z.string(),
  races: z.array(z.number()),
  createdAt: z.coerce.date(),
});

export const UpsertRulesSetSchema = z.object({
  name: z.string().min(1),
  races: z.array(z.number().int()).default([]),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type RulesSet = z.infer<typeof RulesSetSchema>;
export type UpsertRulesSet = z.infer<typeof UpsertRulesSetSchema>;
