import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { SyncSppAwardValues } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * Seeds the standardised SPP award table over the API. One call carries the
 * whole table, since it is a few dozen rows the server upserts by natural
 * key — there is no batching or per-row error reporting to do.
 */
@Injectable()
export class SppAwardValuesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  syncSppAwardValues(data: SyncSppAwardValues, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.sppAwardValues.sync(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to sync ${data.values.length} SPP award value(s): ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
