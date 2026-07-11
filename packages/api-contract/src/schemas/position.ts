import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const PositionRaceSchema = z.object({
  raceId: z.number().int(),
  isDeleted: z.boolean(),
});

export const PositionSchema = z.object({
  id: z.number(),
  name: z.string(),
  isStarPlayer: z.boolean(),
  races: z.array(PositionRaceSchema),
  createdAt: z.coerce.date(),
});

export const UpsertPositionSchema = z.object({
  name: z.string().min(1),
  isStarPlayer: z.boolean(),
  races: z.array(PositionRaceSchema).min(1),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type PositionRace = z.infer<typeof PositionRaceSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type UpsertPosition = z.infer<typeof UpsertPositionSchema>;
