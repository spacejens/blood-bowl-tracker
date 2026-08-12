import type { Db } from '@blood-bowl-tracker/db';
import { DB, matchEvents, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { count, eq, sum } from 'drizzle-orm';

import type { SampledPlayer } from '../shared/review.types';

/** One player's two independently-derived SPP totals. */
export interface PlayerSppTotals {
  /** Sum of `match_events.spp_value` where this player is the acting one. */
  computedTotal: number;
  /** How many events contributed a non-null `spp_value`. */
  eventCount: number;
  sppTotal: number | null;
  sppAdjustment: number | null;
  /** `computedTotal` disagrees with `spp_total`, or nothing is stored. */
  mismatch: boolean;
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

    return {
      computedTotal,
      eventCount: computedRows[0]?.eventCount ?? 0,
      sppTotal,
      sppAdjustment: stored?.sppAdjustment ?? null,
      mismatch: sppTotal === null || sppTotal !== computedTotal,
    };
  }
}
