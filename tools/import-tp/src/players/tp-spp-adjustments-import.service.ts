import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  DEFAULT_BATCH_CHUNK_SIZE,
  ImportResultService,
  SppAdjustmentsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/**
 * Reconciles `players.spp_adjustment` for every player this TP run imported.
 *
 * TP reports an independently trusted, era-correct career total, which the
 * players step already stored as `players.spp_total` — so this step only
 * measures the gap between that total and the sum of the player's own match
 * events, and never rewrites `spp_total`. Players TP reported no total for
 * (e.g. an induced star player) are skipped server-side and keep a NULL
 * adjustment.
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

  async importSppAdjustments(
    playerIds: number[],
  ): Promise<{ result: ImportResult }> {
    const errors: ImportError[] = [];
    let imported = 0;
    const ids = [...new Set(playerIds)];

    // Chunked for the same reason as the BBL step: a bounded payload per
    // call, and one transport hiccup costs only its own chunk.
    for (let i = 0; i < ids.length; i += DEFAULT_BATCH_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + DEFAULT_BATCH_CHUNK_SIZE);
      const outcome = await this.sppAdjustments.syncReportedSppAdjustments(
        { playerIds: chunk },
        errors,
      );
      // A failed call has already pushed its own ImportError onto `errors`.
      imported += outcome?.updatedPlayerIds.length ?? 0;
    }

    return { result: this.importResults.result({ imported, errors }) };
  }
}
