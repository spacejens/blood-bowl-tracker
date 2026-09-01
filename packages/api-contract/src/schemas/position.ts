import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const PositionSchema = z.object({
  id: z.number(),
  name: z.string(),
  isStarPlayer: z.boolean(),
  createdAt: z.coerce.date(),
});

export const UpsertPositionSchema = z.object({
  name: z.string().min(1).optional(),
  isStarPlayer: z.boolean().optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

/**
 * One position's characteristics for a race era.
 *
 * `rulesSetId` names the rules set whose declared characteristic formats the
 * five values are validated against. It is validation input only and is
 * never persisted: `positions_race_eras` is keyed by (position, race era),
 * not by rules set.
 *
 * `passing` is required but nullable, not optional: `null` means "this rules
 * set has no Passing characteristic" and is a real, asserted state, so an
 * omitted value would be an authoring mistake rather than a third meaning.
 */
export const PositionRaceEraCharacteristicsSchema = z.object({
  rulesSetId: z.number().int(),
  move: z.number().int(),
  strength: z.number().int(),
  agility: z.number().int(),
  passing: z.number().int().nullable(),
  armour: z.number().int(),
});

/**
 * A race era a position is available for, optionally carrying that position's
 * characteristics there. Characteristics are optional because a source may
 * know availability without knowing the numbers (TP's star-position sync, or
 * an era nobody has curated yet); such an entry inserts the row and leaves
 * the characteristics columns at their database defaults.
 */
export const RaceEraEntrySchema = z.object({
  raceId: z.number().int(),
  eraId: z.number().int(),
  characteristics: PositionRaceEraCharacteristicsSchema.optional(),
});

export const SyncPositionRaceErasSchema = z.object({
  positionId: z.number().int(),
  raceEras: z.array(RaceEraEntrySchema),
});

export const SyncPositionRaceErasResultSchema = z.object({
  positionId: z.number(),
  raceEraIds: z.array(z.number()),
});

export type Position = z.infer<typeof PositionSchema>;
export type UpsertPosition = z.infer<typeof UpsertPositionSchema>;
export type PositionRaceEraCharacteristics = z.infer<
  typeof PositionRaceEraCharacteristicsSchema
>;
export type SyncPositionRaceEras = z.infer<typeof SyncPositionRaceErasSchema>;
export type RaceEraEntry = z.infer<typeof RaceEraEntrySchema>;
