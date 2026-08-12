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
  // The source's own reported Star Player Points total, where the source
  // publishes a trustworthy one (TP does). BBL's published figure is NOT
  // sent here: it was recalculated at BB2020 rates by the site's migration,
  // so BBL's spp_total is instead derived server-side as the era-correct
  // event sum plus the recovered spp_adjustment (see
  // players.syncScrapedSppAdjustments). Optional in the "no instruction
  // about that column" sense: an omitted value leaves any previously-stored
  // total untouched.
  sppTotal: z.number().int().optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

/**
 * Recompute `players.spp_adjustment` (and `players.spp_total`) for players
 * whose source publishes a career SPP total that this repo does not store
 * verbatim — BBL. `scrapedTotal` is that published figure, or `null` when
 * the source page had none: `null` is a real instruction ("no evidence"),
 * which is why it is required rather than optional. Not an upsert (same
 * rationale as `positions.syncRaceEras`): no external ids, no conflict to
 * detect, no entity+created shape to return.
 */
export const SyncScrapedSppAdjustmentsSchema = z.object({
  players: z.array(
    z.object({
      playerId: z.number().int(),
      scrapedTotal: z.number().int().nullable(),
    }),
  ),
});

/**
 * Recompute `players.spp_adjustment` for players whose already-stored
 * `players.spp_total` is an independently trusted, era-correct figure — TP.
 * `players.spp_total` itself is left untouched; a player with no stored
 * total is skipped.
 */
export const SyncReportedSppAdjustmentsSchema = z.object({
  playerIds: z.array(z.number().int()),
});

export const SyncSppAdjustmentsResultSchema = z.object({
  updatedPlayerIds: z.array(z.number().int()),
});

export type Player = z.infer<typeof PlayerSchema>;
export type UpsertPlayer = z.infer<typeof UpsertPlayerSchema>;
export type SyncScrapedSppAdjustments = z.infer<
  typeof SyncScrapedSppAdjustmentsSchema
>;
export type SyncReportedSppAdjustments = z.infer<
  typeof SyncReportedSppAdjustmentsSchema
>;
export type SyncSppAdjustmentsResult = z.infer<
  typeof SyncSppAdjustmentsResultSchema
>;
