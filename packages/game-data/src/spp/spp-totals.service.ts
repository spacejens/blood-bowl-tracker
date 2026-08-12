import type { Db } from '@blood-bowl-tracker/db';
import { DB, matchEvents } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, sum } from 'drizzle-orm';

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

  /**
   * The era-correct SPP sum for a batch of players: one grouped query over
   * `match_events.spp_value`, keyed by acting player id. Every requested id
   * is present in the returned map — a player with no SPP-earning events
   * gets 0, the same "no events → 0" rule {@link totalForPlayer} applies.
   */
  async totalsForPlayers(playerIds: number[]): Promise<Map<number, number>> {
    const totals = new Map<number, number>();
    const ids = [...new Set(playerIds)];
    if (ids.length === 0) {
      return totals;
    }

    const rows = await this.db
      .select({
        playerId: matchEvents.actingPlayerId,
        total: sum(matchEvents.sppValue),
      })
      .from(matchEvents)
      .where(inArray(matchEvents.actingPlayerId, ids))
      .groupBy(matchEvents.actingPlayerId);

    // row.playerId is typed nullable because match_events.acting_player_id
    // is a nullable FK in general, but every row here came back through the
    // inArray filter above, whose values are all real player ids.
    for (const row of rows) {
      totals.set(
        row.playerId as number,
        row.total === null ? 0 : Number(row.total),
      );
    }
    for (const id of ids) {
      if (!totals.has(id)) {
        totals.set(id, 0);
      }
    }
    return totals;
  }
}
