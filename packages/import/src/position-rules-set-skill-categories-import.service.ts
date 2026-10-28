import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { SyncPositionRulesSetSkillCategories } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * Syncs positions' primary and secondary skill categories over the API. The
 * server validates a batch all-or-nothing and replaces each named pair's
 * whole set. Callers therefore send each pair complete, and keep batches
 * small enough that one bad pair costs no others.
 */
@Injectable()
export class PositionRulesSetSkillCategoriesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  syncPositionRulesSetSkillCategories(
    data: SyncPositionRulesSetSkillCategories,
    errors: ImportError[],
  ) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.positionRulesSetSkillCategories.sync(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to sync the skill categories of ${data.entries.length} position(s): ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
