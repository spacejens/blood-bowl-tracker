import type {
  ImportError,
  ImportResult,
  SppCareerCounts,
  UnspentSppSnapshot,
} from '@blood-bowl-tracker/api-contract';
import { SppAdjustmentsService } from '@blood-bowl-tracker/game-data';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import { Injectable } from '@nestjs/common';

import type { TpLivePlayerSppFacts } from './tp-player-spp-facts.service';

/**
 * Players per sync call: a bounded write per call, and one failure costs
 * only its own chunk. The same size the bulk import's batches use.
 */
export const SPP_ADJUSTMENTS_CHUNK_SIZE = 500;

/** Options for {@link TpLiveSppAdjustmentsService.settle}. */
export interface SettleSppOptions {
  /**
   * Players to leave unsettled, from every entry given: those whose match
   * events failed to import, whose imported-event sum is incomplete, so a
   * later successful import settles them instead.
   */
  excludePlayerIds?: number[];
}

/**
 * Settles `players.spp_total` and `players.spp_adjustment` for the players a
 * live TP import touched, through game-data's
 * `SppAdjustmentsService.syncReportedAdjustments` in-process — the same
 * server-side step the bulk TP import reaches over RPC, so nothing is
 * computed here. It must run only once the players' match events are
 * written: the sync measures TP's reported total against them. Idempotent:
 * the sync writes absolute values. Every failure is recorded in the
 * returned result, never thrown.
 */
@Injectable()
export class TpLiveSppAdjustmentsService {
  constructor(
    private readonly sppAdjustments: SppAdjustmentsService,
    private readonly importResults: ImportResultService,
    private readonly runner: UpsertRecorderService,
  ) {}

  /**
   * `imported` counts the players the sync updated. A player given more
   * than once (a team re-imported by a backfill) is sent once, with the
   * highest reported total and the highest of each career counter, and the unspent
   * snapshot reported beside the higher total, since totals only ever grow. Excluded players are dropped before anything is
   * sent; when none remain, the sync is not called.
   */
  async settle(
    players: TpLivePlayerSppFacts[],
    { excludePlayerIds = [] }: SettleSppOptions = {},
  ): Promise<ImportResult> {
    const excluded = new Set(excludePlayerIds);
    const merged = this.merge(
      players.filter((player) => !excluded.has(player.playerId)),
    );
    const errors: ImportError[] = [];
    let imported = 0;
    for (let i = 0; i < merged.length; i += SPP_ADJUSTMENTS_CHUNK_SIZE) {
      const chunk = merged.slice(i, i + SPP_ADJUSTMENTS_CHUNK_SIZE);
      const outcome = await this.runner.record({
        run: () =>
          this.sppAdjustments.syncReportedAdjustments({ players: chunk }),
        item: { playerIds: chunk.map((player) => player.playerId) },
        errors,
        buildErrorMessage: (error) =>
          `Failed to settle the SPP adjustments of ${chunk.length} players: ${this.runner.messageOf(error)}`,
      });
      imported += outcome?.updatedPlayerIds.length ?? 0;
    }
    return this.importResults.result({ imported, errors });
  }

  private merge(players: TpLivePlayerSppFacts[]): TpLivePlayerSppFacts[] {
    const byPlayerId = new Map<number, TpLivePlayerSppFacts>();
    for (const player of players) {
      const existing = byPlayerId.get(player.playerId);
      byPlayerId.set(
        player.playerId,
        existing === undefined
          ? this.combine(player, {})
          : this.combine(existing, player),
      );
    }
    return [...byPlayerId.values()];
  }

  /** One player's facts from two entries, keeping only the fields set. */
  private combine(
    first: TpLivePlayerSppFacts,
    second: Partial<TpLivePlayerSppFacts>,
  ): TpLivePlayerSppFacts {
    const totals = [first.reportedSppTotal, second.reportedSppTotal].filter(
      (total) => total !== undefined,
    );
    const careerCounts =
      first.careerCounts === undefined
        ? second.careerCounts
        : second.careerCounts === undefined
          ? first.careerCounts
          : this.highest(first.careerCounts, second.careerCounts);
    const snapshot = this.fresherSnapshot(
      first.unspentSppSnapshot,
      second.unspentSppSnapshot,
    );
    return {
      playerId: first.playerId,
      ...(totals.length === 0 ? {} : { reportedSppTotal: Math.max(...totals) }),
      ...(careerCounts === undefined ? {} : { careerCounts }),
      ...(snapshot === undefined ? {} : { unspentSppSnapshot: snapshot }),
    };
  }

  /**
   * The snapshot reported beside the higher total, the later one on a tie:
   * totals only grow, so that is the fresher roster read.
   */
  private fresherSnapshot(
    first: UnspentSppSnapshot | undefined,
    second: UnspentSppSnapshot | undefined,
  ): UnspentSppSnapshot | undefined {
    if (first === undefined) {
      return second;
    }
    if (second === undefined) {
      return first;
    }
    return second.snapshotSppTotal >= first.snapshotSppTotal ? second : first;
  }

  private highest(a: SppCareerCounts, b: SppCareerCounts): SppCareerCounts {
    return {
      touchdown: Math.max(a.touchdown, b.touchdown),
      completion: Math.max(a.completion, b.completion),
      interception: Math.max(a.interception, b.interception),
      mvp_award: Math.max(a.mvp_award, b.mvp_award),
      casualty: Math.max(a.casualty, b.casualty),
    };
  }
}
