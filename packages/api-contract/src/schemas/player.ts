import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

/**
 * The five characteristics, in a fixed order. Exported so consumers iterate
 * the group rather than restating (and drifting from) the list.
 */
export const PLAYER_CHARACTERISTIC_KEYS = [
  'move',
  'strength',
  'agility',
  'passing',
  'armour',
] as const;

/**
 * The seven lasting-injury fields, in a fixed order. Exported so consumers
 * iterate the group rather than restating (and drifting from) the list —
 * which is also what makes the all-or-nothing check below a single loop.
 */
export const PLAYER_LASTING_INJURY_KEYS = [
  'missNextGame',
  'nigglingInjuryCount',
  'moveReductionCount',
  'strengthReductionCount',
  'agilityReductionCount',
  'passingReductionCount',
  'armourReductionCount',
] as const;

/**
 * A player's CURRENTLY OUTSTANDING lasting injuries, as their source reports
 * them right now. Not a career tally: under newer rules sets these heal
 * between competitions, so this is live state rather than history.
 *
 * The five reduction counts are the effective, capped magnitude of each
 * characteristic's current reduction — the real distance between the stored
 * characteristic and the player's baseline — not an occurrence count. A
 * reduction the rules absorbed (the stat was already at its floor, or at the
 * rules' cap on reductions) moved nothing and so counts zero.
 */
/**
 * The five characteristic-increase counts, in the same order as
 * `PLAYER_CHARACTERISTIC_KEYS`. Exported so consumers iterate the group
 * rather than restating (and drifting from) the list — which is also what
 * makes the all-or-nothing check below a single loop.
 */
export const PLAYER_CHARACTERISTIC_INCREASE_KEYS = [
  'moveIncreaseCount',
  'strengthIncreaseCount',
  'agilityIncreaseCount',
  'passingIncreaseCount',
  'armourIncreaseCount',
] as const;

/**
 * How many times each of a player's five characteristics has been increased
 * via advancement. Counts rather than per-event rows: TP never records
 * characteristic-increase events at all, and BBL's ordering signal would
 * cover only a minority of the data, so no per-increase sequence is modelled.
 *
 * 0 is a permanently legitimate "never increased" value, not a placeholder.
 */
export const PlayerCharacteristicIncreasesSchema = z.object({
  moveIncreaseCount: z.number().int().nonnegative(),
  strengthIncreaseCount: z.number().int().nonnegative(),
  agilityIncreaseCount: z.number().int().nonnegative(),
  passingIncreaseCount: z.number().int().nonnegative(),
  armourIncreaseCount: z.number().int().nonnegative(),
});

export const PlayerLastingInjuriesSchema = z.object({
  missNextGame: z.boolean(),
  nigglingInjuryCount: z.number().int().nonnegative(),
  moveReductionCount: z.number().int().nonnegative(),
  strengthReductionCount: z.number().int().nonnegative(),
  agilityReductionCount: z.number().int().nonnegative(),
  passingReductionCount: z.number().int().nonnegative(),
  armourReductionCount: z.number().int().nonnegative(),
});

export const PlayerSchema = z.object({
  id: z.number(),
  name: z.string(),
  teamEraId: z.number().int(),
  positionId: z.number().int(),
  // The player's own current characteristics. Required, not optional: every
  // stored row has concrete values (a placeholder 0 for the four NOT NULL
  // columns until the BBL and TP imports populate real ones). `passing` is
  // nullable because null asserts that the player's rules set has no Passing
  // characteristic at all.
  move: z.number().int(),
  strength: z.number().int(),
  agility: z.number().int(),
  passing: z.number().int().nullable(),
  armour: z.number().int(),
  // The player's currently outstanding lasting injuries. Plain required
  // fields rather than the characteristics precedent's superRefine: there is
  // no NULL/absent ambiguity to model here (false and 0 are permanently
  // legitimate "no injury" values, not placeholders), and both importers ship
  // support for them together.
  ...PlayerLastingInjuriesSchema.shape,
  // The player's advancement-driven characteristic increases. Required for
  // the same reason the lasting injuries above are: every stored row has
  // concrete values, and 0 is a real "never increased", not a placeholder.
  ...PlayerCharacteristicIncreasesSchema.shape,
  createdAt: z.coerce.date(),
});

export const UpsertPlayerSchema = z
  .object({
    // Unlike other entities' upsert schemas, a player's name may be empty —
    // some BBL players legitimately have no name.
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
    // The five characteristics form one optional, all-or-nothing group: a
    // caller supplies all of them (with `passing` possibly null) or none.
    // A partial line cannot be meaningfully validated or stored, and an
    // omitted group leaves whatever is stored untouched.
    move: z.number().int().optional(),
    strength: z.number().int().optional(),
    agility: z.number().int().optional(),
    passing: z.number().int().nullable().optional(),
    armour: z.number().int().optional(),
    // Validation input only, never persisted: the server checks the supplied
    // characteristics against this rules set's declared formats. Nothing
    // stores a rules set on a player row — an era can list several rules sets
    // in sequence, so no single one can be derived from a player, and
    // whichever caller needs one says which it means.
    rulesSetId: z.number().int().optional(),
    // The seven lasting-injury fields form one optional, all-or-nothing
    // group, for the same reason the characteristics do: a partial group
    // cannot be meaningfully stored, and an omitted group leaves whatever is
    // stored untouched. Unlike characteristics they need no rulesSetId —
    // there are no per-rules-set display formats to validate them against.
    missNextGame: z.boolean().optional(),
    nigglingInjuryCount: z.number().int().nonnegative().optional(),
    moveReductionCount: z.number().int().nonnegative().optional(),
    strengthReductionCount: z.number().int().nonnegative().optional(),
    agilityReductionCount: z.number().int().nonnegative().optional(),
    passingReductionCount: z.number().int().nonnegative().optional(),
    armourReductionCount: z.number().int().nonnegative().optional(),
    // The five characteristic increases form their own optional,
    // all-or-nothing group — deliberately independent of the lasting-injury
    // group above, since a source could in principle supply one without the
    // other. An omitted group leaves whatever is stored untouched.
    moveIncreaseCount: z.number().int().nonnegative().optional(),
    strengthIncreaseCount: z.number().int().nonnegative().optional(),
    agilityIncreaseCount: z.number().int().nonnegative().optional(),
    passingIncreaseCount: z.number().int().nonnegative().optional(),
    armourIncreaseCount: z.number().int().nonnegative().optional(),
    externalIds: z.array(ExternalIdSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const supplied = PLAYER_CHARACTERISTIC_KEYS.filter(
      (key) => data[key] !== undefined,
    );
    if (
      supplied.length > 0 &&
      supplied.length < PLAYER_CHARACTERISTIC_KEYS.length
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `Characteristics are all-or-nothing: supply every one of ${PLAYER_CHARACTERISTIC_KEYS.join(', ')} or none`,
      });
    }
    const hasCharacteristics =
      supplied.length === PLAYER_CHARACTERISTIC_KEYS.length;
    if (hasCharacteristics && data.rulesSetId === undefined) {
      ctx.addIssue({
        code: 'custom',
        message:
          'rulesSetId is required when characteristics are supplied, so they can be validated against the rules set',
      });
    }
    if (!hasCharacteristics && data.rulesSetId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message:
          'rulesSetId is only accepted alongside a full set of characteristics',
      });
    }
    const suppliedInjuries = PLAYER_LASTING_INJURY_KEYS.filter(
      (key) => data[key] !== undefined,
    );
    if (
      suppliedInjuries.length > 0 &&
      suppliedInjuries.length < PLAYER_LASTING_INJURY_KEYS.length
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `Lasting injuries are all-or-nothing: supply every one of ${PLAYER_LASTING_INJURY_KEYS.join(', ')} or none`,
      });
    }
    const suppliedIncreases = PLAYER_CHARACTERISTIC_INCREASE_KEYS.filter(
      (key) => data[key] !== undefined,
    );
    if (
      suppliedIncreases.length > 0 &&
      suppliedIncreases.length < PLAYER_CHARACTERISTIC_INCREASE_KEYS.length
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `Characteristic increases are all-or-nothing: supply every one of ${PLAYER_CHARACTERISTIC_INCREASE_KEYS.join(', ')} or none`,
      });
    }
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
 * `players.spp_total` is rewritten to remove the estimated ongoing SPP,
 * without dropping below the confirmed imported total. A player with no
 * stored total is skipped.
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
  /**
   * Whether the source supplied career action counts for this player. When
   * false, no ongoing-competition estimate was possible at all, so the whole
   * reported total counts as unexplained — a source-side data gap (the player
   * had already left the team's live roster before any roster snapshot was
   * captured), not an import discrepancy. Distinguishing the two is what
   * makes the review printout actionable.
   */
  hadCareerCounts: z.boolean(),
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
 * Manufacture the `players_history` rows a freshly-inserted player needs for
 * an injury that was already healed before this import run.
 *
 * A plain current-state-only write records only what is outstanding *now*, so
 * an injury healed before the first import that captured real live state
 * leaves no trace anywhere — and `tools/review-player`'s "healed" stratum has
 * nothing to sample. For each named player the server sums the lasting
 * injuries their already-imported match events record (niggling injuries and
 * stat reductions only — deliberately NOT miss-next-game, which clears after
 * exactly one game and would otherwise flag nearly every player who has ever
 * been hurt). Where that accumulated state differs from the real current
 * state already on the row, it writes the accumulated values and then
 * immediately writes the real ones back, producing the two history versions
 * in the correct order.
 *
 * Callers must send only players INSERTED during the same import run: an
 * existing player already has whatever history their earlier runs built, and
 * re-manufacturing it would add a spurious version pair on every import.
 *
 * Not an upsert (same rationale as positions.syncRaceEras): no external ids,
 * no conflict to detect, no entity+created shape to return.
 */
export const SyncLastingInjuryHistorySchema = z.object({
  playerIds: z.array(z.number().int()),
});

export const SyncLastingInjuryHistoryResultSchema = z.object({
  /**
   * Only the players that actually needed a backfill — i.e. whose accumulated
   * state differed from their current state. A player whose events agree with
   * their current row is left completely untouched and is absent here.
   */
  backfilledPlayerIds: z.array(z.number().int()),
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
export type PlayerLastingInjuries = z.infer<typeof PlayerLastingInjuriesSchema>;
export type PlayerCharacteristicIncreases = z.infer<
  typeof PlayerCharacteristicIncreasesSchema
>;
export type SyncLastingInjuryHistory = z.infer<
  typeof SyncLastingInjuryHistorySchema
>;
export type SyncLastingInjuryHistoryResult = z.infer<
  typeof SyncLastingInjuryHistoryResultSchema
>;
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
