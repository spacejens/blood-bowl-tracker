import type {
  SppAdjustmentSummary,
  SppCareerCounts,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  DEFAULT_BATCH_CHUNK_SIZE,
  ImportResultService,
  SppAdjustmentsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/** Options for {@link TpSppAdjustmentsImportService.importSppAdjustments}. */
export interface ImportSppAdjustmentsOptions {
  /** Every player this TP run imported. */
  playerIds: number[];
  /**
   * TP's career-wide per-action-type counts, keyed by DB player id (from
   * `TpRosterPlayerFactsService`). Optional, and legitimately missing per player:
   * only the standalone roster files carry the counters, so a player seen only
   * in a match-embedded snapshot has none and simply gets no
   * ongoing-competition estimate.
   */
  careerCountsByPlayerId?: Map<number, SppCareerCounts>;
  /**
   * TP's reported career total per DB player id, from the roster import. A
   * player missing here (an induced star) is skipped server-side.
   */
  reportedSppTotalsByPlayerId?: Map<number, number>;
}

/**
 * Reconciles `players.spp_adjustment` for every player this TP run imported.
 *
 * TP reports an independently trusted, era-correct career total. The roster
 * import returns it rather than storing it, and this step sends it per
 * player: the server writes `spp_total` (the reported total with the
 * ongoing-competition estimate backed out) and the remaining gap as
 * `spp_adjustment`. It is the only writer of `spp_total` in a TP run. Players
 * TP reported no total for (e.g. an induced star player) are skipped and keep
 * a NULL adjustment.
 *
 * TP's total is career-wide, including competitions still in progress that have
 * not been downloaded/imported yet, so each player's career action counts are
 * sent along: the server prices the events it has NOT imported and discounts
 * them, instead of misattributing them as unexplained SPP.
 * Whatever adjustment survives that comes back in `nonzeroAdjustments`, a
 * one-off developer review aid the import run prints at the end.
 *
 * Must run after the match-events step, since it depends on
 * `match_events.spp_value` already being populated. Idempotent: the server
 * writes an absolute value on every run.
 */
@Injectable()
export class TpSppAdjustmentsImportService {
  constructor(
    private readonly sppAdjustments: SppAdjustmentsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  async importSppAdjustments({
    playerIds,
    careerCountsByPlayerId,
    reportedSppTotalsByPlayerId,
  }: ImportSppAdjustmentsOptions): Promise<{
    result: ImportResult;
    nonzeroAdjustments: SppAdjustmentSummary[];
  }> {
    const errors: ImportError[] = [];
    let imported = 0;
    const ids = [...new Set(playerIds)];
    const nonzeroAdjustments: SppAdjustmentSummary[] = [];

    // Chunked for the same reason as the BBL step: a bounded payload per
    // call, and one transport hiccup costs only its own chunk.
    for (let i = 0; i < ids.length; i += DEFAULT_BATCH_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + DEFAULT_BATCH_CHUNK_SIZE);
      const outcome = await this.sppAdjustments.syncReportedSppAdjustments(
        {
          players: chunk.map((playerId) => ({
            playerId,
            reportedSppTotal: reportedSppTotalsByPlayerId?.get(playerId),
            careerCounts: careerCountsByPlayerId?.get(playerId),
          })),
        },
        errors,
      );
      // A failed call has already pushed its own ImportError onto `errors`.
      imported += outcome?.updatedPlayerIds.length ?? 0;
      nonzeroAdjustments.push(...(outcome?.nonzeroAdjustments ?? []));
    }

    return {
      result: this.importResults.result({ imported, errors }),
      nonzeroAdjustments: nonzeroAdjustments.sort(
        (a, b) => b.adjustment - a.adjustment,
      ),
    };
  }

  /**
   * The review-aid summary as console lines, biggest adjustment first, or no
   * lines at all when nothing is left unexplained. Entries TP supplied no
   * career counts for are marked: for those, no ongoing-competition estimate
   * was possible at all, so the whole reported total is unexplained by
   * construction — a TP-side data gap rather than a discrepancy worth
   * investigating. Formatting lives here rather than in `main.ts` so it is
   * covered by tests.
   */
  summaryLines(nonzeroAdjustments: SppAdjustmentSummary[]): string[] {
    if (nonzeroAdjustments.length === 0) {
      return [];
    }
    return [
      `${nonzeroAdjustments.length} player(s) left with an unexplained SPP adjustment:`,
      ...nonzeroAdjustments.map(
        (entry) =>
          `  - ${entry.name} (player ${entry.playerId}): ${entry.adjustment} SPP` +
          (entry.hadCareerCounts ? '' : ' (no TP career counts available)'),
      ),
    ];
  }
}
