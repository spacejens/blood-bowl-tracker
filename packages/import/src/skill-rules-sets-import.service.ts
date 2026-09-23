import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  SkillRulesSetCategory,
  SyncSkillRulesSets,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * Reads and writes which category a skill has under a rules set. Same shape as
 * PositionRulesSetsImportService: the association carries no external ids, so
 * this is a sync (keyed by the natural (skill, rules set) pair) plus a
 * read-back, with a rejected batch coming back as one recorded ImportError.
 *
 * A missing row is meaningful: a rules set with no row for a skill simply does
 * not have that skill, which is exactly what the read-back is used to detect.
 */
@Injectable()
export class SkillRulesSetsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  syncSkillRulesSets(data: SyncSkillRulesSets, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.skillRulesSets.sync(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to sync ${data.entries.length} skill/rules-set pair(s): ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  /**
   * Every rules set one skill exists under, with its category there. Reuses
   * recordUpsertResult for a read exactly as
   * CompetitionGroupsImportService.listCompetitionGroups does: the helper is
   * "run this call, record a failure as an ImportError, return undefined" --
   * nothing about it is upsert-specific beyond the option's name.
   */
  listSkillRulesSets(
    skillId: number,
    errors: ImportError[],
  ): Promise<SkillRulesSetCategory[] | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.skillRulesSets.list({ skillId }),
      item: { skillRulesSets: skillId },
      errors,
      buildErrorMessage: (err) =>
        `Failed to list categories for skill ${skillId}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
