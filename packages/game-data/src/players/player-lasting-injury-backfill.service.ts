import type {
  PlayerLastingInjuries,
  SyncLastingInjuryHistory,
  SyncLastingInjuryHistoryResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  count,
  DB,
  inArray,
  matchEvents,
  players,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { ConsequenceType } from '../shared/match-event-types';
import { LASTING_INJURY_SUFFERED_TYPES } from '../shared/match-event-types';

/** The lasting-injury fields this backfill recomputes, without missNextGame. */
type AccumulatedInjuries = Omit<PlayerLastingInjuries, 'missNextGame'>;

/**
 * Which accumulated counter each lasting-injury consequence type feeds. Keyed
 * with a `Partial` over the full {@link ConsequenceType} union (rather than a
 * literal type derived from {@link LASTING_INJURY_SUFFERED_TYPES}, which is
 * exported as a widened `readonly ConsequenceType[]` and so carries no
 * narrower literal type to derive from) — the accumulation loop below treats a
 * missing entry as "not a lasting-injury type" and skips it, so an
 * out-of-scope consequence type is a safe, silent no-op rather than a compile
 * error.
 */
export const COUNTER_BY_CONSEQUENCE_TYPE: Readonly<
  Partial<Record<ConsequenceType, keyof AccumulatedInjuries>>
> = {
  niggling_injury: 'nigglingInjuryCount',
  stat_reduction_ma: 'moveReductionCount',
  stat_reduction_st: 'strengthReductionCount',
  stat_reduction_ag: 'agilityReductionCount',
  stat_reduction_pa: 'passingReductionCount',
  stat_reduction_av: 'armourReductionCount',
};

const EMPTY: AccumulatedInjuries = {
  nigglingInjuryCount: 0,
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
};

/** A player's stored lasting-injury state, as the first query reads it. */
interface CurrentRow extends PlayerLastingInjuries {
  id: number;
}

/**
 * Manufactures the `players_history` versions a freshly-inserted player needs
 * for a lasting injury that was already healed before this import run.
 *
 * A current-state-only write records only what is outstanding now, so an
 * injury healed before the first import that captured real live state leaves
 * no trace anywhere — and `tools/review-player`'s "healed" stratum would have
 * nothing to sample for anything healed before rollout. This recovers it from
 * the one record that does survive: the player's own match events.
 *
 * Scope is deliberately narrower than the columns: niggling injuries and stat
 * reductions only (`LASTING_INJURY_SUFFERED_TYPES`), never miss-next-game,
 * which is expected to clear after exactly one game and would otherwise flag
 * nearly every player who has ever been hurt at all. `missNextGame` is
 * therefore carried through both writes at its current value, so the two
 * manufactured versions differ only in the fields this backfill is about.
 *
 * Its own service rather than another method on `PlayersService`, which is at
 * the repo's 500-line source ceiling — the same reason `PlayerDeathService`
 * is separate.
 */
@Injectable()
export class PlayerLastingInjuryBackfillService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async syncLastingInjuryHistory(
    data: SyncLastingInjuryHistory,
  ): Promise<SyncLastingInjuryHistoryResult> {
    const playerIds = [...new Set(data.playerIds)];
    if (playerIds.length === 0) {
      return { backfilledPlayerIds: [] };
    }

    const currentRows = await this.currentState(playerIds);
    if (currentRows.length === 0) {
      return { backfilledPlayerIds: [] };
    }

    const accumulated = await this.accumulatedState(
      currentRows.map((row) => row.id),
    );

    const needingBackfill = currentRows.filter((row) =>
      this.needsBackfill(row, accumulated.get(row.id) ?? EMPTY),
    );
    if (needingBackfill.length === 0) {
      return { backfilledPlayerIds: [] };
    }

    // One transaction around every player's pair of writes: a failure part-way
    // through would otherwise leave some players with the ACCUMULATED values
    // committed as their current state, which is worse than not backfilling
    // at all.
    await this.db.transaction(async (tx) => {
      for (const row of needingBackfill) {
        const past = accumulated.get(row.id) ?? EMPTY;
        // Two sequential UPDATEs, never batched with another player's: the
        // versioning() trigger records one history row per UPDATE, so the
        // pair must be adjacent and in this order to read as "was injured,
        // then healed".
        await tx
          .update(players)
          .set({ ...past, missNextGame: row.missNextGame })
          .where(inArray(players.id, [row.id]));
        await tx
          .update(players)
          .set(this.currentValues(row))
          .where(inArray(players.id, [row.id]));
      }
    });

    return {
      backfilledPlayerIds: needingBackfill
        .map((row) => row.id)
        .sort((a, b) => a - b),
    };
  }

  private async currentState(playerIds: number[]): Promise<CurrentRow[]> {
    return this.db
      .select({
        id: players.id,
        missNextGame: players.missNextGame,
        nigglingInjuryCount: players.nigglingInjuryCount,
        moveReductionCount: players.moveReductionCount,
        strengthReductionCount: players.strengthReductionCount,
        agilityReductionCount: players.agilityReductionCount,
        passingReductionCount: players.passingReductionCount,
        armourReductionCount: players.armourReductionCount,
      })
      .from(players)
      .where(inArray(players.id, playerIds));
  }

  /**
   * What each player's already-imported match events say they have ever
   * accumulated, as one grouped query rather than one per player.
   */
  private async accumulatedState(
    playerIds: number[],
  ): Promise<Map<number, AccumulatedInjuries>> {
    const rows = await this.db
      .select({
        playerId: matchEvents.consequencePlayerId,
        consequenceType: matchEvents.consequenceType,
        total: count(),
      })
      .from(matchEvents)
      .where(
        and(
          inArray(matchEvents.consequencePlayerId, playerIds),
          inArray(matchEvents.consequenceType, LASTING_INJURY_SUFFERED_TYPES),
        ),
      )
      .groupBy(matchEvents.consequencePlayerId, matchEvents.consequenceType);

    const byPlayer = new Map<number, AccumulatedInjuries>();
    for (const row of rows) {
      if (row.playerId === null || row.consequenceType === null) {
        continue;
      }
      const counter = COUNTER_BY_CONSEQUENCE_TYPE[row.consequenceType];
      if (counter === undefined) {
        continue;
      }
      const existing = byPlayer.get(row.playerId) ?? { ...EMPTY };
      existing[counter] += row.total;
      byPlayer.set(row.playerId, existing);
    }
    return byPlayer;
  }

  /** The row's own values, minus its id — what the second UPDATE writes back. */
  private currentValues(row: CurrentRow): PlayerLastingInjuries {
    const { id: _id, ...values } = row;
    return values;
  }

  /**
   * Whether this player's current row and accumulated match-event history
   * justify manufacturing the accumulated-then-real backfill pair.
   *
   * A raw match-event count and the real row's effective, capped magnitude
   * are structurally different quantities — BBL's "(no effect)" tag still
   * records an event even when the roll changed nothing, and either
   * importer's locally mirrored match history can have gaps — so they
   * cannot be expected to agree in general. Rather than compare them
   * directly, this only backfills when the current row is entirely at its
   * default state (no active lasting injury) and the accumulated history
   * proves an injury was recorded at some point: exactly "shows no injury
   * now, but history proves once injured", which is what the healed
   * stratum is meant to detect. A player who is already showing an
   * outstanding injury needs no manufactured history, since their current
   * row already is the accurate, live-scraped truth.
   */
  private needsBackfill(row: CurrentRow, past: AccumulatedInjuries): boolean {
    return this.isCurrentlyClean(row) && this.hasAccumulatedInjury(past);
  }

  private isCurrentlyClean(row: CurrentRow): boolean {
    return (
      !row.missNextGame &&
      (Object.keys(EMPTY) as (keyof AccumulatedInjuries)[]).every(
        (key) => row[key] === 0,
      )
    );
  }

  private hasAccumulatedInjury(past: AccumulatedInjuries): boolean {
    return (Object.keys(EMPTY) as (keyof AccumulatedInjuries)[]).some(
      (key) => past[key] !== 0,
    );
  }
}
