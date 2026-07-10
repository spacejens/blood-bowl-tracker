import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const PositionSchema = z.object({
  id: z.number(),
  name: z.string(),
  raceId: z.number(),
  createdAt: z.coerce.date(),
});

export const UpsertPositionSchema = z.object({
  name: z.string().min(1),
  raceId: z.number().int(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Position = z.infer<typeof PositionSchema>;
export type UpsertPosition = z.infer<typeof UpsertPositionSchema>;
