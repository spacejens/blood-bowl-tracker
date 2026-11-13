import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  SyncReportedSppAdjustments,
  SyncScrapedSppAdjustments,
  SyncSppAdjustmentsResult,
} from '@blood-bowl-tracker/api-contract';
import { ImportResultService } from '@blood-bowl-tracker/import-shared';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * The source-agnostic half of the SPP-adjustment step: ask the server to
 * recompute `players.spp_adjustment` for a batch of players, recording a
 * non-fatal error if the call itself fails. Which players to send — and
 * which of the two shapes applies — is each importer's business: BBL sends
 * the career totals it scraped, TP sends bare ids and the server reads the
 * totals it already imported. A confirmed advancement order the reported
 * sync finds contradicting the stored SPP comes back in `orderProblems`.
 * Each one is recorded as an error, so the rest of the import carries on and
 * the run reports failure.
 */
@Injectable()
export class SppAdjustmentsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
    private readonly importResults: ImportResultService,
  ) {}

  syncScrapedSppAdjustments(
    data: SyncScrapedSppAdjustments,
    errors: ImportError[],
  ): Promise<SyncSppAdjustmentsResult | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.players.syncScrapedSppAdjustments(data),
      item: data,
      errors,
      buildErrorMessage: (err: unknown) =>
        `Failed to sync scraped SPP adjustments for ${data.players.length} player(s): ${
          err instanceof Error ? err.message : String(err)
        }`,
    });
  }

  async syncReportedSppAdjustments(
    data: SyncReportedSppAdjustments,
    errors: ImportError[],
  ): Promise<SyncSppAdjustmentsResult | undefined> {
    const result = await this.importRunner.recordUpsertResult({
      upsert: () => this.client.players.syncReportedSppAdjustments(data),
      item: data,
      errors,
      buildErrorMessage: (err: unknown) =>
        `Failed to sync reported SPP adjustments for ${data.players.length} player(s): ${
          err instanceof Error ? err.message : String(err)
        }`,
    });
    errors.push(
      ...this.importResults.orderProblemErrors(result?.orderProblems ?? []),
    );
    return result;
  }
}
