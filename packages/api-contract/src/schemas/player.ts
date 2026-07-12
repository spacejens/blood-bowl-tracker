import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const PlayerSchema = z.object({
  id: z.number(),
  name: z.string(),
  teamEraId: z.number().int(),
  positionId: z.number().int(),
  createdAt: z.coerce.date(),
});

export const UpsertPlayerSchema = z.object({
  name: z.string().min(1),
  teamEraId: z.number().int(),
  positionId: z.number().int(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Player = z.infer<typeof PlayerSchema>;
export type UpsertPlayer = z.infer<typeof UpsertPlayerSchema>;
