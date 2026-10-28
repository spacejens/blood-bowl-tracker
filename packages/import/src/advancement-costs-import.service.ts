import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { SyncAdvancementCosts } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * Syncs the advancement cost table over the API. One call carries every
 * cost, since it is a few dozen rows the server matches by natural key --
 * there is no batching or per-row error reporting to do. Hand-written rather
 * than built on `createUpsertImportServiceBase`, because the underlying
 * procedure is a sync, not an upsert.
 */
@Injectable()
export class AdvancementCostsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  syncAdvancementCosts(data: SyncAdvancementCosts, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.advancementCosts.sync(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to sync ${data.costs.length} advancement cost(s): ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
