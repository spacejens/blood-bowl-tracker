import type {
  SppAdjustmentSummary,
  SppCareerCounts,
  SyncReportedSppAdjustments,
  SyncScrapedSppAdjustments,
  SyncSppAdjustmentsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, inArray, isNotNull } from 'drizzle-orm';

import { SppForcedRateService } from './spp-forced-rate.service';
import { SppOngoingEstimateService } from './spp-ongoing-estimate.service';
import { SppTotalsService } from './spp-totals.service';

interface AdjustmentWrite {
  sppAdjustment: number | null;
  sppTotal?: number;
}

/**
 * Computes and persists `players.spp_adjustment` — the SPP a player holds
 * that their recorded match events cannot explain — one batch of players at
 * a time.
 *
 * Two sources, two shapes:
 *  - BBL ({@link syncScrapedAdjustments}) supplies the career total scraped
 *    off the site, whose award rates are post-migration, so the gap is
 *    measured against the forced-rate replay. BBL's `spp_total` is then
 *    rebuilt as `era-correct event sum + adjustment` — the site's own mixed
 *    -rate figure is never stored.
 *  - TP ({@link syncReportedAdjustments}) already reports an independently
 *    trusted, era-correct total in `players.spp_total`, so the gap is
 *    measured against the era-correct event sum PLUS an estimate of the SPP
 *    the player earned in competitions that have not been imported yet (see
 *    SppOngoingEstimateService). `spp_total` is then rewritten to the
 *    corrected total — the reported figure with that ongoing-competition
 *    estimate backed out, floored at the era-correct event sum — so the two
 *    consumers that read `spp_total` directly (the Discord bot's player
 *    deep-dive display and the all-time/league/era leaderboard ranking) see
 *    a figure consistent with what's actually explainable from imported data
 *    plus any genuine remaining adjustment, not the raw TP total.
 *    Every remaining nonzero adjustment comes back in `nonzeroAdjustments` as
 *    a developer review aid.
 *
 * Both write an absolute `set`, never an increment, so re-running a sync is
 * idempotent, and both group the write-back by written VALUE rather than
 * issuing one update per player: a BBL run passes hundreds of ids but only a
 * handful of distinct (adjustment, total) pairs.
 */
@Injectable()
export class SppAdjustmentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sppTotals: SppTotalsService,
    private readonly forcedRate: SppForcedRateService,
    private readonly ongoingEstimate: SppOngoingEstimateService,
  ) {}

  async syncScrapedAdjustments(
    data: SyncScrapedSppAdjustments,
  ): Promise<SyncSppAdjustmentsResult> {
    // A repeated player id keeps its LAST entry: a later page read is the
    // fresher snapshot of the same player.
    const scrapedByPlayerId = new Map<number, number | null>();
    for (const entry of data.players) {
      scrapedByPlayerId.set(entry.playerId, entry.scrapedTotal);
    }
    const ids = [...scrapedByPlayerId.keys()];
    if (ids.length === 0) {
      return { updatedPlayerIds: [] };
    }

    const eraCorrectSums = await this.sppTotals.totalsForPlayers(ids);
    const forcedSums = await this.forcedRate.forcedRateSumsForPlayers(ids);

    const writes = new Map<number, AdjustmentWrite>();
    for (const id of ids) {
      const scraped = scrapedByPlayerId.get(id) ?? null;
      const eraCorrect = eraCorrectSums.get(id) ?? 0;
      // No scraped figure means no evidence either way: the adjustment stays
      // NULL ("not computed"), and spp_total falls back to the plain
      // era-correct sum, which is what it was before this feature.
      const adjustment =
        scraped === null
          ? null
          : Math.max(0, scraped - (forcedSums.get(id) ?? 0));
      writes.set(id, {
        sppAdjustment: adjustment,
        sppTotal: eraCorrect + (adjustment ?? 0),
      });
    }

    return this.applyWrites(writes);
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
    for (const entry of data.players) {
      careerCountsByPlayerId.set(entry.playerId, entry.careerCounts);
    }
    const ids = [...careerCountsByPlayerId.keys()];
    if (ids.length === 0) {
      return { updatedPlayerIds: [], nonzeroAdjustments: [] };
    }

    // Only players whose source actually reported a total can have an
    // adjustment computed; the rest keep spp_adjustment NULL. The name comes
    // along for the nonzero-adjustment summary below.
    const rows = await this.db
      .select({
        id: players.id,
        name: players.name,
        sppTotal: players.sppTotal,
      })
      .from(players)
      .where(and(inArray(players.id, ids), isNotNull(players.sppTotal)));
    if (rows.length === 0) {
      return { updatedPlayerIds: [], nonzeroAdjustments: [] };
    }

    const reportedIds = rows.map((row) => row.id);
    const eraCorrectSums = await this.sppTotals.totalsForPlayers(reportedIds);
    // SPP the source has counted but this database has not imported — events
    // in a competition still in progress. Without this, the whole contribution
    // of those events is misattributed as unexplained (see issue #381).
    const ongoingEstimates = await this.ongoingEstimate.estimateForPlayers(
      rows.map((row) => ({
        playerId: row.id,
        careerCounts: careerCountsByPlayerId.get(row.id),
      })),
    );

    const writes = new Map<number, AdjustmentWrite>();
    const nonzeroAdjustments: SppAdjustmentSummary[] = [];
    for (const row of rows) {
      // sppTotal is typed nullable on the column, but the isNotNull filter
      // above means every row here has one.
      const reported = row.sppTotal ?? 0;
      const importedSum = eraCorrectSums.get(row.id) ?? 0;
      const estimatedOngoing = ongoingEstimates.get(row.id) ?? 0;
      // The corrected total: the reported figure with the ongoing-competition
      // estimate backed out, never dropping below the confirmed-imported sum
      // (an overshooting estimate must not erase real imported events). The
      // adjustment then falls out as whatever gap the corrected total still
      // leaves over the imported sum — algebraically identical to the old
      // max(0, reported - (importedSum + estimatedOngoing)), just restructured
      // so correctedTotal is available to write back into spp_total.
      const correctedTotal = Math.max(importedSum, reported - estimatedOngoing);
      const adjustment = Math.max(0, correctedTotal - importedSum);
      writes.set(row.id, {
        sppAdjustment: adjustment,
        sppTotal: correctedTotal,
      });
      if (adjustment > 0) {
        nonzeroAdjustments.push({
          playerId: row.id,
          name: row.name,
          adjustment,
        });
      }
    }

    return {
      ...(await this.applyWrites(writes)),
      nonzeroAdjustments: nonzeroAdjustments.sort(
        (a, b) => b.adjustment - a.adjustment,
      ),
    };
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
      const key = `${write.sppAdjustment}:${write.sppTotal ?? 'keep'}`;
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
