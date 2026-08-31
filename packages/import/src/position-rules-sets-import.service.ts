import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { SyncPositionRulesSets } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * Writes positions' characteristics under a rules set over the API. One call
 * carries a whole batch, which the server validates against the rules set's
 * declared formats and upserts by the natural (position, rules set) pair — so
 * there is no per-row error reporting to do here; a rejected batch comes back
 * as one recorded ImportError. Same shape as SppAwardValuesImportService.
 */
@Injectable()
export class PositionRulesSetsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  syncPositionRulesSets(data: SyncPositionRulesSets, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.positionRulesSets.sync(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to sync ${data.entries.length} position/rules-set pair(s): ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
