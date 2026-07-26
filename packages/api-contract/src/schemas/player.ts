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
  // Unlike other entities' upsert schemas, a player's name may be empty —
  // some BBL players legitimately have no name (see issue #131).
  name: z.string().optional(),
  teamEraId: z.number().int().optional(),
  positionId: z.number().int().optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Player = z.infer<typeof PlayerSchema>;
export type UpsertPlayer = z.infer<typeof UpsertPlayerSchema>;
