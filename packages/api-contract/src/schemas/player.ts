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
  // publishes one (TP does; BBL's is computed server-side instead — see
  // docs/plans/2026-08-12-import-trusted-spp-totals-design.md). Optional in
  // the "no instruction about that column" sense: an omitted value leaves
  // any previously-stored total untouched.
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
  updatedPlayerIds: z.array(z.number()),
});

export type Player = z.infer<typeof PlayerSchema>;
export type UpsertPlayer = z.infer<typeof UpsertPlayerSchema>;
export type SyncComputedSppTotals = z.infer<typeof SyncComputedSppTotalsSchema>;
export type SyncComputedSppTotalsResult = z.infer<
  typeof SyncComputedSppTotalsResultSchema
>;
