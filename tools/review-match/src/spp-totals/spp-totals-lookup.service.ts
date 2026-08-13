import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  matchEvents,
  matchTeams,
  players,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, ne, or, sum } from 'drizzle-orm';

import type { SampledMatch } from '../shared/review.types';

/** One player's two independently-derived SPP totals, for one match's review. */
export interface PlayerSppRow {
  playerId: number;
  playerName: string;
  teamName: string;
  /** Sum of `match_events.spp_value` for this player in THIS match. */
  matchTotal: number;
  /** Sum of `match_events.spp_value` for this player across ALL matches. */
  computedTotal: number;
  sppTotal: number | null;
  sppAdjustment: number | null;
  /**
   * `spp_total` disagrees with `computedTotal + sppAdjustment`, or nothing is
   * stored at all. `spp_total` is defined as the event sum plus
   * `spp_adjustment` (see `packages/game-data`'s `SppAdjustmentsService`), so
   * comparing against the raw `computedTotal` would flag a healthy adjusted
   * player as a mismatch.
   */
  mismatch: boolean;
}

/** Row shape of the identity/stored-totals query. */
interface PlayerDetailRow {
  playerId: number;
  playerName: string;
  teamName: string;
  sppTotal: number | null;
  sppAdjustment: number | null;
}

/**
 * Loads both sides of the SPP comparison for one sampled match.
 *
 * Scope is deliberately wider than "players who did something in this match":
 * every player on either roster who has no stored total at all, or already
 * carries a non-zero one, is included too, because a cumulative disagreement
 * (or an always-a-mismatch missing total) is worth seeing next to the match
 * that may have caused it even when the player earned nothing here.
 *
 * Only ACTING participants count towards the computed sum: SPP is earned by
 * doing something, never by having something done to you. This comparison is
 * written here rather than shared with packages/game-data on purpose — reusing
 * that code would let a bug in it agree with itself instead of showing up as a
 * difference (see docs/review-match/index.md).
 */
@Injectable()
export class SppTotalsLookupService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async load(match: SampledMatch): Promise<PlayerSppRow[]> {
    const inMatch = await this.inMatchTotals(match);
    const rosterPlayerIds = await this.rosterPlayerIds(match);
    const playerIds = [...new Set([...inMatch.keys(), ...rosterPlayerIds])];
    if (playerIds.length === 0) {
      return [];
    }

    const details = await this.details(playerIds);
    const computed = await this.computedTotals(playerIds);

    return details
      .map((detail): PlayerSppRow => {
        const computedTotal = computed.get(detail.playerId) ?? 0;
        return {
          ...detail,
          matchTotal: inMatch.get(detail.playerId) ?? 0,
          computedTotal,
          mismatch:
            detail.sppTotal === null ||
            detail.sppTotal !== computedTotal + (detail.sppAdjustment ?? 0),
        };
      })
      .sort((a, b) => this.compare(a, b));
  }

  /** Player id -> SPP earned in this match, for acting participants only. */
  private async inMatchTotals(
    match: SampledMatch,
  ): Promise<Map<number, number>> {
    const rows = await this.db
      .select({
        playerId: matchEvents.actingPlayerId,
        matchTotal: sum(matchEvents.sppValue),
      })
      .from(matchEvents)
      .where(
        and(
          eq(matchEvents.matchId, match.matchId),
          isNotNull(matchEvents.actingPlayerId),
        ),
      )
      .groupBy(matchEvents.actingPlayerId);
    return this.totals(rows.map((row) => [row.playerId, row.matchTotal]));
  }

  /**
   * Players on either roster who either have no stored total at all (always
   * a mismatch, so always in scope) or already carry a non-zero one. A
   * stored 0 needs no dedicated inclusion: it can only disagree with a
   * non-zero computed sum, which only arises from events, which would already
   * have put the player in scope through some match.
   */
  private async rosterPlayerIds(match: SampledMatch): Promise<number[]> {
    const rows = await this.db
      .select({ playerId: players.id })
      .from(players)
      .innerJoin(matchTeams, eq(matchTeams.teamEraId, players.teamEraId))
      .where(
        and(
          eq(matchTeams.matchId, match.matchId),
          or(isNull(players.sppTotal), ne(players.sppTotal, 0)),
        ),
      );
    return rows.map((row) => row.playerId);
  }

  private async details(playerIds: number[]): Promise<PlayerDetailRow[]> {
    return this.db
      .select({
        playerId: players.id,
        playerName: players.name,
        teamName: teams.name,
        sppTotal: players.sppTotal,
        sppAdjustment: players.sppAdjustment,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(inArray(players.id, playerIds));
  }

  /** Player id -> cumulative SPP sum across every match. */
  private async computedTotals(
    playerIds: number[],
  ): Promise<Map<number, number>> {
    const rows = await this.db
      .select({
        playerId: matchEvents.actingPlayerId,
        computedTotal: sum(matchEvents.sppValue),
      })
      .from(matchEvents)
      .where(inArray(matchEvents.actingPlayerId, playerIds))
      .groupBy(matchEvents.actingPlayerId);
    return this.totals(rows.map((row) => [row.playerId, row.computedTotal]));
  }

  /**
   * `SUM` over zero matching rows is SQL NULL and drizzle returns a sum as a
   * string, so both are normalised to a plain number: no SPP-earning event
   * means a total of 0, not "unknown".
   */
  private totals(pairs: [number | null, string | null][]): Map<number, number> {
    const totals = new Map<number, number>();
    for (const [playerId, total] of pairs) {
      if (playerId !== null) {
        totals.set(playerId, total === null ? 0 : Number(total));
      }
    }
    return totals;
  }

  private compare(a: PlayerSppRow, b: PlayerSppRow): number {
    if (a.playerName !== b.playerName) {
      return a.playerName < b.playerName ? -1 : 1;
    }
    return a.playerId - b.playerId;
  }
}
