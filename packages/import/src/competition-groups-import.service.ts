import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertCompetitionGroup } from '@blood-bowl-tracker/api-contract';
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
   * The whole curated catalog as id/name pairs. Deliberately NOT routed
   * through ImportRunnerService: this is a read, and a failing read is an
   * infrastructure failure (API down, bad token) rather than one bad data
   * item, so it propagates and aborts the run -- the same way a missing data
   * directory or an unreachable API already does.
   */
  listCompetitionGroups(): Promise<{ id: number; name: string }[]> {
    return this.client.competitionGroups.list({});
  }
}
