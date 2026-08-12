import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  SyncComputedSppTotals,
  SyncComputedSppTotalsResult,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * The source-agnostic half of the computed-SPP-total step: ask the server to
 * recompute `players.spp_total` from each player's own match events, and
 * record a non-fatal error if the call itself fails. Which players to send is
 * each importer's business — BBL sends every player it just imported.
 */
@Injectable()
export class SppTotalsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  syncComputedSppTotals(
    data: SyncComputedSppTotals,
    errors: ImportError[],
  ): Promise<SyncComputedSppTotalsResult | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.players.syncComputedSppTotals(data),
      item: data,
      errors,
      buildErrorMessage: (err: unknown) =>
        `Failed to sync computed SPP totals for ${data.playerIds.length} player(s): ${
          err instanceof Error ? err.message : String(err)
        }`,
    });
  }
}
