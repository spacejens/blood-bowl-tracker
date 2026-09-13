import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  PositionRulesSetCharacteristics,
  SyncPositionRulesSets,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * Reads and writes positions' characteristics under a rules set over the API. One call
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

  /**
   * Every stat line already stored for one position, so an importer whose own
   * source data carries no characteristics can use the curated ones instead of
   * holding a second copy of them. Resolves to undefined (with an error
   * recorded) when the call fails.
   *
   * Reuses recordUpsertResult even though this is a read, exactly as
   * CompetitionGroupsImportService.listCompetitionGroups does: the helper is
   * "run this call, record a failure as an ImportError, return undefined" --
   * nothing about it is upsert-specific beyond the option's name.
   */
  listPositionRulesSets(
    positionId: number,
    errors: ImportError[],
  ): Promise<PositionRulesSetCharacteristics[] | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.positionRulesSets.list({ positionId }),
      item: { positionRulesSets: positionId },
      errors,
      buildErrorMessage: (err) =>
        `Failed to list characteristics for position ${positionId}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
