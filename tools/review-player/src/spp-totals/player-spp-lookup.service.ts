import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eraRulesSets,
  matchEvents,
  players,
  sppAwardValues,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNotNull, sql, sum } from 'drizzle-orm';

import type { SampledPlayer } from '../shared/review.types';

/**
 * One match event whose recorded SPP contribution disagrees with the
 * standardised award table, for a single player.
 */
export interface NonStandardSppEvent {
  actionType: string;
  recordedValue: number;
  expectedValue: number;
}

/** One player's two independently-derived SPP totals. */
export interface PlayerSppTotals {
  /** Sum of `match_events.spp_value` where this player is the acting one. */
  computedTotal: number;
  /** How many events contributed a non-null `spp_value`. */
  eventCount: number;
  sppTotal: number | null;
  sppAdjustment: number | null;
  /**
   * `spp_total` disagrees with `computedTotal + sppAdjustment`, or nothing is
   * stored. `spp_total` is defined as the event sum plus `spp_adjustment`
   * (see `packages/game-data`'s `SppAdjustmentsService`), so comparing
   * against the raw `computedTotal` would flag a healthy adjusted player as
   * a mismatch.
   */
  mismatch: boolean;
  /**
   * This player's own match events whose recorded SPP disagrees with the
   * standardised award table (see
   * `SppNonStandardContributionStratificationService`, whose award-resolution
   * query this mirrors per-event instead of as a boolean). Non-empty only for
   * a TP-sourced player: a BBL-sourced event's value is computed directly
   * from the award table, so it can never disagree by construction.
   */
  nonStandardEvents: NonStandardSppEvent[];
}

/**
 * Loads both sides of one player's SPP comparison.
 *
 * Only ACTING participants count towards the computed sum: SPP is earned by
 * doing something, never by having something done to you. Written here rather
 * than reused from packages/game-data's SppTotalsService, and deliberately not
 * shared with tools/review-match's equivalent either — a comparison that
 * borrows the code under review can only ever agree with it.
 */
@Injectable()
export class PlayerSppLookupService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async load(player: SampledPlayer): Promise<PlayerSppTotals> {
    const computedRows = await this.db
      .select({
        computedTotal: sum(matchEvents.sppValue),
        eventCount: count(matchEvents.sppValue),
      })
      .from(matchEvents)
      .where(eq(matchEvents.actingPlayerId, player.playerId));

    const storedRows = await this.db
      .select({
        sppTotal: players.sppTotal,
        sppAdjustment: players.sppAdjustment,
      })
      .from(players)
      .where(eq(players.id, player.playerId));

    // SUM over zero rows is SQL NULL, and drizzle returns a sum as a string:
    // no SPP-earning event means a total of 0, not "unknown".
    const computed = computedRows[0]?.computedTotal;
    const computedTotal =
      computed === null || computed === undefined ? 0 : Number(computed);
    const stored = storedRows[0];
    const sppTotal = stored?.sppTotal ?? null;
    const sppAdjustment = stored?.sppAdjustment ?? null;

    const nonStandardEvents =
      player.source === 'tp' ? await this.loadNonStandardEvents(player) : [];

    return {
      computedTotal,
      eventCount: computedRows[0]?.eventCount ?? 0,
      sppTotal,
      sppAdjustment,
      mismatch:
        sppTotal === null || sppTotal !== computedTotal + (sppAdjustment ?? 0),
      nonStandardEvents,
    };
  }

  /**
   * Per-event version of
   * `SppNonStandardContributionStratificationService.sampleStratum`'s
   * award-resolution query, filtered to a single player rather than grouped
   * to a boolean. The `expected` correlated subquery is copied verbatim from
   * that service — see its doc comment for why the award is re-derived here
   * instead of reused from `packages/game-data`.
   */
  private async loadNonStandardEvents(
    player: SampledPlayer,
  ): Promise<NonStandardSppEvent[]> {
    const expected = sql<number>`coalesce((
      select ${sppAwardValues.sppValue}
      from ${sppAwardValues}
      inner join ${eraRulesSets}
        on ${eraRulesSets.rulesSetId} = ${sppAwardValues.rulesSetId}
      where ${eraRulesSets.eraId} = ${teamEras.eraId}
        and ${sppAwardValues.actionType} = ${matchEvents.actionType}
        and (${sppAwardValues.raceId} is null
             or ${sppAwardValues.raceId} = ${teams.raceId})
      order by ${sppAwardValues.raceId} nulls last
      limit 1
    ), 0)`;
    const rows = await this.db
      .select({
        actionType: matchEvents.actionType,
        recordedValue: sql<number>`coalesce(${matchEvents.sppValue}, 0)`,
        expectedValue: expected,
      })
      .from(matchEvents)
      .innerJoin(players, eq(players.id, matchEvents.actingPlayerId))
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(
        and(
          eq(matchEvents.actingPlayerId, player.playerId),
          isNotNull(matchEvents.actionType),
          sql`coalesce(${matchEvents.sppValue}, 0) is distinct from ${expected}`,
        ),
      );
    // The isNotNull filter above guarantees a non-null actionType at runtime;
    // the query builder's column type can't express that.
    return rows.map((row) => ({ ...row, actionType: row.actionType! }));
  }
}
