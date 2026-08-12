import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eras,
  matches,
  matchEvents,
  matchTeams,
  players,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, inArray, ne, sql, sum } from 'drizzle-orm';

import type { FactScope } from '../shared/fact-scope';
import { matchScopeFilter } from '../shared/match-event-counts';

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
   * Players ranked by the SPP they earned *within a scope*, most first.
   *
   * Used for the competition- and match-category-scoped SPP toplist, where
   * `players.spp_total` cannot be used: it includes manual adjustments whose
   * originating match — and therefore competition or category — is unknown,
   * so an adjustment cannot be attributed to a narrower scope than the
   * player's own era. Summing the per-event values is the attributable part.
   *
   * Unlike every `count*` query on this join graph there is no action-type
   * restriction: SPP-earning events are not one fixed type set. Players whose
   * scoped sum is 0 are dropped (`HAVING ... <> 0`, not `> 0`: SPP values are
   * never negative in practice, but excluding "not zero" rather than
   * "positive" costs nothing and doesn't silently hide a negative sum if that
   * assumption is ever wrong), mirroring the null-`spp_total` exclusion on
   * the stored-total path.
   */
  topPlayersBySppSum(
    scope: FactScope,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    const total = sql<number>`coalesce(sum(${matchEvents.sppValue}), 0)::int`;
    return this.db
      .select({ playerId: players.id, name: players.name, count: total })
      .from(matchEvents)
      .innerJoin(players, eq(players.id, matchEvents.actingPlayerId))
      .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(matchScopeFilter(scope))
      .groupBy(players.id, players.name)
      .having(ne(total, 0))
      .orderBy(desc(total))
      .limit(limit);
  }
}
