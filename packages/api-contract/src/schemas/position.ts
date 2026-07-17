import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const PositionSchema = z.object({
  id: z.number(),
  name: z.string(),
  isStarPlayer: z.boolean(),
  createdAt: z.coerce.date(),
});

export const UpsertPositionSchema = z.object({
  name: z.string().min(1),
  isStarPlayer: z.boolean(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export const RaceEraRefSchema = z.object({
  raceId: z.number().int(),
  eraId: z.number().int(),
});

export const SyncPositionRaceErasSchema = z.object({
  positionId: z.number().int(),
  raceEras: z.array(RaceEraRefSchema),
});

export const SyncPositionRaceErasResultSchema = z.object({
  positionId: z.number(),
  raceEraIds: z.array(z.number()),
});

export type Position = z.infer<typeof PositionSchema>;
export type UpsertPosition = z.infer<typeof UpsertPositionSchema>;
export type SyncPositionRaceEras = z.infer<typeof SyncPositionRaceErasSchema>;
export type RaceEraRef = z.infer<typeof RaceEraRefSchema>;
