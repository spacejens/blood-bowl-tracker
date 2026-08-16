import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  CompetitionGroup,
  UpsertCompetitionGroup,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class CompetitionGroupsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  /**
   * Resolves to the upserted group (including its DB `id`) on success, or
   * `undefined` on failure -- the caller records the id so later curated data
   * can classify competitions and trophies into the group.
   */
  upsertCompetitionGroup(data: UpsertCompetitionGroup, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.competitionGroups.upsert(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to import competition group "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  /**
   * Every curated competition group, so an importer can map a competition's
   * `competitionGroupId` back to the group's curated name. Resolves to
   * `undefined` (with an error recorded) when the call fails.
   *
   * Reuses `recordUpsertResult` even though this is a read: the helper is
   * "run this call, record a failure as an ImportError, return undefined" —
   * nothing about it is upsert-specific beyond the option's name.
   */
  listCompetitionGroups(
    errors: ImportError[],
  ): Promise<CompetitionGroup[] | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.competitionGroups.list({}),
      item: { competitionGroups: 'list' },
      errors,
      buildErrorMessage: (err) =>
        `Failed to list competition groups: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
