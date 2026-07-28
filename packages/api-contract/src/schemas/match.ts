import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

/**
 * Every match category, in the same order as `game_data.match_category`
 * (packages/db). Exported as a tuple so consumers can iterate the values as
 * well as use the inferred union type.
 */
export const MATCH_CATEGORIES = [
  'normal',
  'cup_final',
  'season_semi_final',
  'season_final',
  'season_bronze',
  'season_qualifier',
] as const;

export type MatchCategory = (typeof MATCH_CATEGORIES)[number];

export const MatchSchema = z.object({
  id: z.number(),
  competitionId: z.number(),
  teamEraIds: z.array(z.number()),
  name: z.string(),
  category: z.enum(MATCH_CATEGORIES),
  playedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export const UpsertMatchSchema = z.object({
  competitionId: z.number().int().optional(),
  playedAt: z.date().optional(),
  name: z.string().min(1).optional(),
  /**
   * Optional in the same sense every other field here is: an upsert payload
   * is an overlay, and `undefined` means "say nothing about this column"
   * (see `upsertByExternalIds`). It is NOT optional in practice on the
   * create path — the column is NOT NULL with no default, so omitting it
   * when creating a new match raises `MissingRequiredFieldError` naming
   * `category`. Every importer must set it explicitly.
   */
  category: z.enum(MATCH_CATEGORIES).optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
  teamEraIds: z.array(z.number().int()).default([]),
});

export type Match = z.infer<typeof MatchSchema>;
export type UpsertMatch = z.infer<typeof UpsertMatchSchema>;
