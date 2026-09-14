import type {
  PlayerLastingInjuries,
  SyncLastingInjuryHistory,
  SyncLastingInjuryHistoryResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, SQL } from '@blood-bowl-tracker/db';
import {
  and,
  count,
  DB,
  eq,
  gt,
  inArray,
  matchEvents,
  or,
  players,
  playersHistory,
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
 * The `tx` handle `Db['transaction']`'s callback receives. It is not the same
 * type as `Db` itself (drizzle's transaction client is missing `$client` and a
 * couple of other top-level-only members), so a method that must run either
 * on `this.db` or inside a transaction takes `Db | TransactionClient` rather
 * than `Db` alone.
 */
type TransactionClient = Parameters<Parameters<Db['transaction']>[0]>[0];

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

    const candidates = currentRows.filter((row) =>
      this.needsBackfill(row, accumulated.get(row.id) ?? EMPTY),
    );
    if (candidates.length === 0) {
      return { backfilledPlayerIds: [] };
    }

    // One transaction around every player's pair of writes: a failure part-way
    // through would otherwise leave some players with the ACCUMULATED values
    // committed as their current state, which is worse than not backfilling
    // at all.
    //
    // The already-backfilled check itself also happens inside this
    // transaction, per player, immediately after a row lock on that player —
    // never before the transaction opens. Two overlapping calls for the same
    // currently-clean player (e.g. two concurrent RPC invocations) would
    // otherwise both read an empty already-backfilled set before either
    // transaction committed its writes, and both would manufacture a
    // duplicate accumulated-then-real pair: exactly the race the lock closes.
    // The lock serializes the second transaction behind the first, so its
    // recheck (after acquiring the lock) sees the first transaction's
    // now-committed history row and skips.
    const backfilledPlayerIds: number[] = [];
    // Sorted by id before locking: two concurrent transactions processing
    // overlapping candidate sets must always acquire row locks in the same
    // global order, or they can deadlock (transaction A holds player 7 and
    // waits on player 8 while transaction B holds player 8 and waits on
    // player 7). This ordering is load-bearing for deadlock avoidance, not
    // merely for the response shape — `backfilledPlayerIds` below is already
    // re-sorted independently for that — so do not remove it as redundant.
    const orderedCandidates = [...candidates].sort((a, b) => a.id - b.id);
    await this.db.transaction(async (tx) => {
      for (const row of orderedCandidates) {
        await this.lockPlayerRow(tx, row.id);
        const alreadyBackfilled = await this.alreadyBackfilled([row.id], tx);
        if (alreadyBackfilled.has(row.id)) {
          continue;
        }

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
        backfilledPlayerIds.push(row.id);
      }
    });

    return {
      backfilledPlayerIds: backfilledPlayerIds.sort((a, b) => a - b),
    };
  }

  /**
   * Locks the player row for the duration of the enclosing transaction, so a
   * second concurrent call for the same player blocks here until the first
   * transaction commits (or rolls back) rather than racing it — see the
   * comment above this method's only call site.
   */
  private async lockPlayerRow(
    tx: TransactionClient,
    playerId: number,
  ): Promise<void> {
    await tx
      .select({ id: players.id })
      .from(players)
      .where(inArray(players.id, [playerId]))
      .for('update');
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

  /**
   * Which of the given players already carry a `players_history` row proving
   * a prior backfill: any version whose lasting-injury columns are not all at
   * their default. Follows the same query shape as
   * `HealedInjuryStratificationService.anyInjuryInHistory` — this codebase's
   * other `playersHistory` consumer — including its bracket-access pattern
   * for the mirrored columns (see that file for why).
   *
   * `playersHistory`'s generated column map types every property through an
   * index signature (see that file's own comment for why), so the selected
   * `id` column type-checks but comes back as `unknown` — the same table
   * `players.id` mirrors, so the cast back to `number` is safe.
   *
   * Takes an explicit `executor` (defaulting to `this.db`) so the same query
   * can run either outside a transaction or, as its only real caller does,
   * inside one after a row lock — see `lockPlayerRow`.
   */
  private async alreadyBackfilled(
    playerIds: number[],
    executor: Db | TransactionClient = this.db,
  ): Promise<Set<number>> {
    const rows = await executor
      .select({ id: playersHistory.id })
      .from(playersHistory)
      .where(
        and(inArray(playersHistory.id, playerIds), this.anyInjuryInHistory()),
      );
    return new Set(rows.map((row) => row.id as number));
  }

  /** Any one of the seven lasting-injury columns away from its default. */
  private anyInjuryInHistory(): SQL {
    return or(
      eq(playersHistory[players.missNextGame.name], true),
      gt(playersHistory[players.nigglingInjuryCount.name], 0),
      gt(playersHistory[players.moveReductionCount.name], 0),
      gt(playersHistory[players.strengthReductionCount.name], 0),
      gt(playersHistory[players.agilityReductionCount.name], 0),
      gt(playersHistory[players.passingReductionCount.name], 0),
      gt(playersHistory[players.armourReductionCount.name], 0),
    ) as SQL;
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
