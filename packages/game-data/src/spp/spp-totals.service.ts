import type {
  SyncComputedSppTotals,
  SyncComputedSppTotalsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, matchEvents, players } from '@blood-bowl-tracker/db';
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

  /**
   * Recompute and persist `players.spp_total` for a batch of players as the
   * sum of their own `match_events.spp_value` — the same figure
   * {@link totalForPlayer} computes on demand, written down so it can be
   * queried uniformly alongside TP's source-reported totals.
   *
   * A player with no SPP-earning events is written 0, not left alone: the
   * same "no events → 0" rule `totalForPlayer` already applies.
   *
   * The write-back is grouped by total VALUE rather than issued per player,
   * because a BBL run passes tens of thousands of ids but only a few dozen
   * distinct totals. Each write is an absolute `set`, never an increment, so
   * re-running the sync is idempotent.
   */
  async syncComputedTotals(
    data: SyncComputedSppTotals,
  ): Promise<SyncComputedSppTotalsResult> {
    const playerIds = [...new Set(data.playerIds)];
    if (playerIds.length === 0) {
      return { updatedPlayerIds: [] };
    }

    const rows = await this.db
      .select({
        playerId: matchEvents.actingPlayerId,
        total: sum(matchEvents.sppValue),
      })
      .from(matchEvents)
      .where(inArray(matchEvents.actingPlayerId, playerIds))
      .groupBy(matchEvents.actingPlayerId);

    // row.playerId is typed nullable (matchEvents.actingPlayerId is a
    // nullable FK generally), but every row here came back through the
    // inArray(matchEvents.actingPlayerId, playerIds) filter above, whose
    // values are all real, non-null player ids -- so it can never actually
    // be null here.
    const totalsByPlayerId = new Map<number, number>();
    for (const row of rows) {
      totalsByPlayerId.set(
        row.playerId as number,
        row.total === null ? 0 : Number(row.total),
      );
    }

    const playerIdsByTotal = new Map<number, number[]>();
    for (const playerId of playerIds) {
      const total = totalsByPlayerId.get(playerId) ?? 0;
      const group = playerIdsByTotal.get(total);
      if (group === undefined) {
        playerIdsByTotal.set(total, [playerId]);
      } else {
        group.push(playerId);
      }
    }

    const updatedPlayerIds: number[] = [];
    for (const [total, ids] of playerIdsByTotal) {
      const updated = await this.db
        .update(players)
        .set({ sppTotal: total })
        .where(inArray(players.id, ids))
        .returning({ id: players.id });
      updatedPlayerIds.push(...updated.map((row) => row.id));
    }

    return { updatedPlayerIds: updatedPlayerIds.sort((a, b) => a - b) };
  }
}
