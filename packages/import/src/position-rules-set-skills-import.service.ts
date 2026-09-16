import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  PositionRulesSetSkillRef,
  SyncPositionRulesSetSkills,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * Reads and writes positions' starting skills under a rules set, mirroring
 * PositionRulesSetsImportService exactly.
 *
 * The server validates and writes a batch all-or-nothing: one entry naming a
 * skill the rules set does not have, or a position with no characteristics
 * under that rules set, rejects every entry in the same call. Callers
 * therefore keep batches small -- one per (position, rules set) pair -- so one
 * bad skill cannot cost a position its other rules sets.
 */
@Injectable()
export class PositionRulesSetSkillsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  syncPositionRulesSetSkills(
    data: SyncPositionRulesSetSkills,
    errors: ImportError[],
  ) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.positionRulesSetSkills.sync(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to sync ${data.entries.length} starting skill(s): ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  listPositionRulesSetSkills(
    positionId: number,
    errors: ImportError[],
  ): Promise<PositionRulesSetSkillRef[] | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.positionRulesSetSkills.list({ positionId }),
      item: { positionRulesSetSkills: positionId },
      errors,
      buildErrorMessage: (err) =>
        `Failed to list starting skills for position ${positionId}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
