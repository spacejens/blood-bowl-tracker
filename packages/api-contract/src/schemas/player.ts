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
 * TP's career-wide action counts for one player, folded into the groups TP's
 * own counters use. Each key IS the `action_type` whose `spp_award_values` row
 * prices the whole group: `interception` stands in for deflections too (TP
 * reports one combined counter and its raw JSON has no deflection field), and
 * `casualty` stands in for every casualty severity (TP reports one combined
 * counter). Career-wide means inclusive of competitions that have not been
 * imported locally yet -- which is the entire point of sending them.
 */
export const SppCareerCountsSchema = z.object({
  touchdown: z.number().int().nonnegative(),
  completion: z.number().int().nonnegative(),
  interception: z.number().int().nonnegative(),
  mvp_award: z.number().int().nonnegative(),
  casualty: z.number().int().nonnegative(),
});

/**
 * Recompute `players.spp_adjustment` for players whose already-stored
 * `players.spp_total` is an independently trusted, era-correct figure — TP.
 * `players.spp_total` itself is left untouched; a player with no stored
 * total is skipped.
 *
 * `careerCounts` is optional: when present, the server subtracts an estimate of
 * the SPP the player's not-yet-imported (ongoing competition) events would
 * contribute before measuring what is left unexplained. When absent — e.g. a
 * player only ever seen in a match-embedded roster snapshot, which carries no
 * counters — no estimate is made and the gap is measured against the imported
 * events alone.
 */
export const SyncReportedSppAdjustmentsSchema = z.object({
  players: z.array(
    z.object({
      playerId: z.number().int(),
      careerCounts: SppCareerCountsSchema.optional(),
    }),
  ),
});

/** One player left with a nonzero `spp_adjustment` after a sync. */
export const SppAdjustmentSummarySchema = z.object({
  playerId: z.number().int(),
  name: z.string(),
  adjustment: z.number().int(),
});

export const SyncSppAdjustmentsResultSchema = z.object({
  updatedPlayerIds: z.array(z.number().int()),
  /**
   * Every player this call left with a nonzero adjustment, biggest first — a
   * developer review aid the TP importer prints at the end of its run, so a
   * remaining discrepancy can be eyeballed against the grouping approximations
   * the estimate makes. Optional: only the reported (TP) path populates it.
   */
  nonzeroAdjustments: z.array(SppAdjustmentSummarySchema).optional(),
});

/**
 * Every career-count group key, in a fixed order. Exported so consumers can
 * iterate the groups without restating the list (and drifting from it).
 */
export const SPP_CAREER_COUNT_KEYS = [
  'touchdown',
  'completion',
  'interception',
  'mvp_award',
  'casualty',
] as const satisfies readonly (keyof SppCareerCounts)[];

export type Player = z.infer<typeof PlayerSchema>;
export type UpsertPlayer = z.infer<typeof UpsertPlayerSchema>;
export type SyncScrapedSppAdjustments = z.infer<
  typeof SyncScrapedSppAdjustmentsSchema
>;
export type SppCareerCounts = z.infer<typeof SppCareerCountsSchema>;
export type SyncReportedSppAdjustments = z.infer<
  typeof SyncReportedSppAdjustmentsSchema
>;
export type SppAdjustmentSummary = z.infer<typeof SppAdjustmentSummarySchema>;
export type SyncSppAdjustmentsResult = z.infer<
  typeof SyncSppAdjustmentsResultSchema
>;
