import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  SyncLastingInjuryHistory,
  SyncLastingInjuryHistoryResult,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * The source-agnostic half of the lasting-injury history backfill: ask the
 * server to manufacture the `players_history` versions a batch of
 * freshly-inserted players needs, recording a non-fatal error if the call
 * itself fails. Which players to send is each importer's business — both send
 * the ids their own `players` step inserted (not updated) during the same run.
 *
 * Modelled on `SppAdjustmentsImportService`: same shape, same single
 * responsibility, same "a failed batch is one ImportError, not a dead run".
 */
@Injectable()
export class LastingInjuriesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  syncLastingInjuryHistory(
    data: SyncLastingInjuryHistory,
    errors: ImportError[],
  ): Promise<SyncLastingInjuryHistoryResult | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.players.syncLastingInjuryHistory(data),
      item: data,
      errors,
      buildErrorMessage: (err: unknown) =>
        `Failed to backfill lasting-injury history for ${data.playerIds.length} player(s): ${
          err instanceof Error ? err.message : String(err)
        }`,
    });
  }
}
