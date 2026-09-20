import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { SyncPositionRulesSetKeywords } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * Reads and writes positions' keywords under a rules set, mirroring
 * `PositionRulesSetSkillsImportService` exactly.
 */
@Injectable()
export class PositionRulesSetKeywordsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  syncPositionRulesSetKeywords(
    data: SyncPositionRulesSetKeywords,
    errors: ImportError[],
  ) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.positionRulesSetKeywords.sync(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to sync ${data.entries.length} position keyword(s): ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  listPositionRulesSetKeywords(positionId: number, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.positionRulesSetKeywords.list({ positionId }),
      item: { positionId },
      errors,
      buildErrorMessage: (err) =>
        `Failed to read position ${positionId}'s keywords: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
