import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const RaceSchema = z.object({
  id: z.number(),
  name: z.string(),
  eras: z.array(z.number()),
  createdAt: z.coerce.date(),
});

export const UpsertRaceSchema = z.object({
  name: z.string().min(1).optional(),
  eras: z.array(z.number().int()).default([]),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Race = z.infer<typeof RaceSchema>;
export type UpsertRace = z.infer<typeof UpsertRaceSchema>;

export const ListOngoingErasSchema = z.object({
  raceId: z.number().int(),
});

/** One era a race can currently be played in (no end date). */
export const OngoingEraSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export type ListOngoingEras = z.infer<typeof ListOngoingErasSchema>;
export type OngoingEra = z.infer<typeof OngoingEraSchema>;
