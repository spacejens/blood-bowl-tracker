import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  SppTotalsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/**
 * Reconciles `players.spp_total` for every player this BBL run imported to
 * the sum of their own `match_events.spp_value`.
 *
 * BBL's own published per-player total is deliberately NOT scraped: it may
 * have been corrupted by the site's BB2016→BB2020 migration (see
 * docs/plans/2026-08-12-import-trusted-spp-totals-design.md). Computing the
 * figure instead keeps the column uniformly populated across both import
 * sources without a caller needing to know which system a player came from.
 *
 * Must run after the match-events step, since it depends on
 * `match_events.spp_value` already being populated for these players.
 * Idempotent: the server rewrites an absolute total on every run.
 */
@Injectable()
export class BblSppTotalsImportService {
  constructor(
    private readonly sppTotals: SppTotalsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  async importSppTotals(
    playerIds: number[],
  ): Promise<{ result: ImportResult }> {
    const errors: ImportError[] = [];
    let imported = 0;

    if (playerIds.length > 0) {
      const outcome = await this.sppTotals.syncComputedSppTotals(
        { playerIds },
        errors,
      );
      // A failed call has already pushed its own ImportError onto `errors`.
      imported = outcome?.updatedPlayerIds.length ?? 0;
    }

    return { result: this.importResults.result({ imported, errors }) };
  }
}
