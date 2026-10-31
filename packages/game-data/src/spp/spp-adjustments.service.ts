import type {
  SppAdjustmentSummary,
  SppCareerCounts,
  SyncReportedSppAdjustments,
  SyncScrapedSppAdjustments,
  SyncSppAdjustmentsResult,
  UnspentSppSnapshot,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, inArray, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { BblSkillSourceInferenceService } from './bbl-skill-source-inference.service';
import { SppForcedRateService } from './spp-forced-rate.service';
import { SppOngoingEstimateService } from './spp-ongoing-estimate.service';
import { SppTotalsService } from './spp-totals.service';
import { UnspentSppDecisionService } from './unspent-spp-decision.service';

interface TotalWrite {
  sppAdjustment: number | null;
  sppTotal: number;
}

interface AdjustmentWrite extends TotalWrite {
  unspentSpp: number | null;
}

/**
 * Computes and persists `players.spp_adjustment` — the SPP a player holds that
 * their recorded match events cannot explain.
 *
 * The two sources need different baselines. BBL's scraped career total uses
 * post-migration award rates, so the gap is measured against the forced-rate
 * replay and `spp_total` is rebuilt as era-correct event sum plus adjustment;
 * the site's own mixed-rate figure is never stored. TP already reports an
 * era-correct total, so the gap is measured against the era-correct event sum
 * plus an estimate of SPP earned in competitions not yet imported, and
 * `spp_total` is written as the reported total with that estimate backed out
 * (this step is its only writer for the bulk TP import) — otherwise the
 * deep-dive display and the leaderboards would rank on a figure that imported
 * data cannot account for.
 *
 * Both write an absolute value rather than an increment, so re-running a sync
 * is idempotent, and group the write-back by written value: a BBL run touches
 * hundreds of players but only a handful of distinct pairs.
 *
 * Both also write `players.unspent_spp` (see `UnspentSppDecisionService`): this
 * is the last step of every import, so it is where that column is settled
 * against the total being written.
 *
 * The BBL sync also records a gained skill as chosen or random when the
 * spend BBL reports settles it (see `BblSkillSourceInferenceService`),
 * before the unspent SPP is decided.
 */
@Injectable()
export class SppAdjustmentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sppTotals: SppTotalsService,
    private readonly forcedRate: SppForcedRateService,
    private readonly ongoingEstimate: SppOngoingEstimateService,
    private readonly unspentDecision: UnspentSppDecisionService,
    private readonly skillSources: BblSkillSourceInferenceService,
  ) {}

  async syncScrapedAdjustments(
    data: SyncScrapedSppAdjustments,
  ): Promise<SyncSppAdjustmentsResult> {
    // A repeated player id keeps its LAST entry: a later page read is the
    // fresher snapshot of the same player.
    const scrapedByPlayerId = new Map<
      number,
      SyncScrapedSppAdjustments['players'][number]
    >();
    for (const entry of data.players) {
      scrapedByPlayerId.set(entry.playerId, entry);
    }
    const ids = [...scrapedByPlayerId.keys()];
    if (ids.length === 0) {
      return { updatedPlayerIds: [] };
    }

    const eraCorrectSums = await this.sppTotals.totalsForPlayers(ids);
    const forcedSums = await this.forcedRate.forcedRateSumsForPlayers(ids);

    const totals = new Map<number, TotalWrite>();
    const snapshots = new Map<number, UnspentSppSnapshot>();
    for (const [id, entry] of scrapedByPlayerId) {
      const scraped = entry.scrapedTotal;
      const eraCorrect = eraCorrectSums.get(id) ?? 0;
      // No scraped figure means no evidence either way: the adjustment stays
      // NULL ("not computed"), and spp_total falls back to the plain
      // era-correct sum.
      const adjustment =
        scraped === null
          ? null
          : Math.max(0, scraped - (forcedSums.get(id) ?? 0));
      totals.set(id, {
        sppAdjustment: adjustment,
        sppTotal: eraCorrect + (adjustment ?? 0),
      });
      // BBL's unspent figure sits in the same row as the bracketed career
      // total, so that total is the snapshot it is checked against.
      if (scraped !== null && entry.reportedUnspentSpp !== undefined) {
        snapshots.set(id, {
          unspentSpp: entry.reportedUnspentSpp,
          snapshotSppTotal: scraped,
        });
      }
    }

    // BBL does not say whether a gained skill was rolled or chosen, but the
    // spend its page implies can settle it. This runs first so the unspent
    // decision below reads the narrowed history.
    await this.skillSources.inferSources(snapshots);
    return this.applyWrites(await this.withUnspentSpp(totals, snapshots));
  }

  async syncReportedAdjustments(
    data: SyncReportedSppAdjustments,
  ): Promise<SyncSppAdjustmentsResult> {
    // A repeated player id keeps its LAST entry, the same rule the scraped
    // path applies: a later entry is the fresher snapshot of the same player.
    const careerCountsByPlayerId = new Map<
      number,
      SppCareerCounts | undefined
    >();
    const reportedByPlayerId = new Map<number, number>();
    const snapshotsByPlayerId = new Map<number, UnspentSppSnapshot>();
    for (const entry of data.players) {
      careerCountsByPlayerId.set(entry.playerId, entry.careerCounts);
      if (entry.unspentSppSnapshot === undefined) {
        snapshotsByPlayerId.delete(entry.playerId);
      } else {
        snapshotsByPlayerId.set(entry.playerId, entry.unspentSppSnapshot);
      }
      if (entry.reportedSppTotal === undefined) {
        reportedByPlayerId.delete(entry.playerId);
      } else {
        reportedByPlayerId.set(entry.playerId, entry.reportedSppTotal);
      }
    }
    // Only players whose source reported a total can have an adjustment
    // computed; the rest keep spp_adjustment NULL. The stored spp_total is
    // never read: this sync is its only writer, so a re-run with the same
    // payload writes the same values.
    const ids = [...reportedByPlayerId.keys()];
    if (ids.length === 0) {
      return { updatedPlayerIds: [], nonzeroAdjustments: [] };
    }

    // The name comes along for the nonzero-adjustment summary below.
    const rows = await this.db
      .select({ id: players.id, name: players.name })
      .from(players)
      .where(inArray(players.id, ids));
    if (rows.length === 0) {
      return { updatedPlayerIds: [], nonzeroAdjustments: [] };
    }

    const reportedIds = rows.map((row) => row.id);
    const eraCorrectSums = await this.sppTotals.totalsForPlayers(reportedIds);
    // SPP the source has counted but this database has not imported — events
    // in a competition still in progress. Without this, the whole contribution
    // of those events is misattributed as unexplained.
    const ongoingEstimates = await this.ongoingEstimate.estimateForPlayers(
      rows.map((row) => ({
        playerId: row.id,
        careerCounts: careerCountsByPlayerId.get(row.id),
      })),
    );

    const totals = new Map<number, TotalWrite>();
    const nonzeroAdjustments: SppAdjustmentSummary[] = [];
    for (const row of rows) {
      const reported = reportedByPlayerId.get(row.id) ?? 0;
      const importedSum = eraCorrectSums.get(row.id) ?? 0;
      const estimatedOngoing = ongoingEstimates.get(row.id) ?? 0;
      // The corrected total: the reported figure with the ongoing-competition
      // estimate backed out, never dropping below the confirmed-imported sum
      // (an overshooting estimate must not erase real imported events). The
      // adjustment then falls out as whatever gap the corrected total still
      // leaves over the imported sum, so correctedTotal is also available to
      // write back into spp_total.
      const correctedTotal = Math.max(importedSum, reported - estimatedOngoing);
      const adjustment = Math.max(0, correctedTotal - importedSum);
      totals.set(row.id, {
        sppAdjustment: adjustment,
        sppTotal: correctedTotal,
      });
      if (adjustment > 0) {
        nonzeroAdjustments.push({
          playerId: row.id,
          name: row.name,
          adjustment,
          // No career counts means the estimate had nothing to work from, so
          // the whole reported total is unexplained by construction.
          hadCareerCounts: careerCountsByPlayerId.get(row.id) !== undefined,
        });
      }
    }

    return {
      ...(await this.applyWrites(
        await this.withUnspentSpp(totals, snapshotsByPlayerId),
      )),
      nonzeroAdjustments: nonzeroAdjustments.sort(
        (a, b) => b.adjustment - a.adjustment,
      ),
    };
  }

  /**
   * Adds each player's unspent SPP, decided against the total about to be
   * written, so both columns always describe the same snapshot.
   */
  private async withUnspentSpp(
    totals: Map<number, TotalWrite>,
    snapshots: Map<number, UnspentSppSnapshot>,
  ): Promise<Map<number, AdjustmentWrite>> {
    const decided = await this.unspentDecision.decide(
      [...totals].map(([playerId, { sppTotal }]) => ({
        playerId,
        sppTotal,
        snapshot: snapshots.get(playerId) ?? null,
      })),
    );
    return new Map(
      [...totals].map(([playerId, write]) => [
        playerId,
        { ...write, unspentSpp: decided.get(playerId) ?? null },
      ]),
    );
  }

  /**
   * Issue one UPDATE per distinct written value, not per player, and return
   * the ids Postgres reports as written, sorted.
   */
  private async applyWrites(
    writes: Map<number, AdjustmentWrite>,
  ): Promise<SyncSppAdjustmentsResult> {
    const idsByWrite = new Map<
      string,
      { write: AdjustmentWrite; ids: number[] }
    >();
    for (const [playerId, write] of writes) {
      const key = `${write.sppAdjustment}:${write.sppTotal}:${write.unspentSpp}`;
      const group = idsByWrite.get(key);
      if (group === undefined) {
        idsByWrite.set(key, { write, ids: [playerId] });
      } else {
        group.ids.push(playerId);
      }
    }

    // One transaction around every group: a failure part-way through would
    // otherwise leave the earlier groups' UPDATEs committed while the sync
    // reports failure, i.e. a partially adjusted batch.
    return this.db.transaction(async (tx) => {
      const updatedPlayerIds: number[] = [];
      for (const { write, ids } of idsByWrite.values()) {
        const updated = await tx
          .update(players)
          .set(write)
          .where(inArray(players.id, ids))
          .returning({ id: players.id });
        updatedPlayerIds.push(...updated.map((row) => row.id));
      }
      return { updatedPlayerIds: updatedPlayerIds.sort((a, b) => a - b) };
    });
  }
}
