import type { Db } from '@blood-bowl-tracker/db';
import { DB, matchEvents } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, sum } from 'drizzle-orm';

/**
 * A player's Star Player Points total: the sum of the per-event awards
 * already stored on `match_events.spp_value` at import time. Nothing is
 * re-derived here — that is the whole point of storing the value per event
 * (see docs/plans/2026-08-11-standardised-spp-totals-design.md).
 *
 * Only events where the player is the ACTING participant count: SPP is
 * earned by doing something, never by having something done to you.
 */
@Injectable()
export class SppTotalsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * `SUM` over zero rows is SQL NULL, and drizzle returns the sum as a
   * string, so both are normalised to a plain number here: a player with no
   * SPP-earning events has a total of 0, not "unknown".
   */
  async totalForPlayer(playerId: number): Promise<number> {
    const rows = await this.db
      .select({ total: sum(matchEvents.sppValue) })
      .from(matchEvents)
      .where(eq(matchEvents.actingPlayerId, playerId));

    const total = rows[0]?.total;
    return total === null || total === undefined ? 0 : Number(total);
  }
}
