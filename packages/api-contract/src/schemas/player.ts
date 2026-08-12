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
  // publishes one (TP does; BBL's own total is not imported here, since it
  // may have been corrupted by the site's BB2016-to-BB2020 migration — BBL's
  // total is instead computed server-side from match_events.spp_value).
  // Optional in the "no instruction about that column" sense: an omitted
  // value leaves any previously-stored total untouched.
  sppTotal: z.number().int().optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

/**
 * Recompute `players.spp_total` for these players from the sum of their own
 * `match_events.spp_value`. Not an upsert (same rationale as
 * `positions.syncRaceEras` / `sppAwardValues.sync`): no external ids, no
 * conflict to detect, no entity+created shape to return.
 */
export const SyncComputedSppTotalsSchema = z.object({
  playerIds: z.array(z.number().int()),
});

export const SyncComputedSppTotalsResultSchema = z.object({
  updatedPlayerIds: z.array(z.number().int()),
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
export type SyncComputedSppTotals = z.infer<typeof SyncComputedSppTotalsSchema>;
export type SyncComputedSppTotalsResult = z.infer<
  typeof SyncComputedSppTotalsResultSchema
>;
export type SyncScrapedSppAdjustments = z.infer<
  typeof SyncScrapedSppAdjustmentsSchema
>;
export type SyncReportedSppAdjustments = z.infer<
  typeof SyncReportedSppAdjustmentsSchema
>;
export type SyncSppAdjustmentsResult = z.infer<
  typeof SyncSppAdjustmentsResultSchema
>;
