import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  Competition,
  UpsertCompetition,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class CompetitionsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  private static errorMessage(data: UpsertCompetition) {
    return (err: unknown): string =>
      `Failed to import competition "${data.name}": ${err instanceof Error ? err.message : String(err)}`;
  }

  upsertCompetition(
    data: UpsertCompetition,
    errors: ImportError[],
  ): Promise<boolean> {
    return this.importRunner.recordUpsert({
      upsert: () => this.client.competitions.upsert(data),
      item: data,
      errors,
      buildErrorMessage: CompetitionsImportService.errorMessage(data),
    });
  }

  /**
   * Like {@link upsertCompetition}, but resolves to the upserted competition
   * -- the row's full current state, including its DB `id` and its
   * `competitionGroupId` -- or `undefined` on failure. Callers need the id to
   * link matches, and tools/import-tp's awards step needs the group id: the
   * response is authoritative for it, since an upsert that omits
   * `competitionGroupId` leaves the stored classification alone rather than
   * clearing it.
   */
  upsertCompetitionResult(
    data: UpsertCompetition,
    errors: ImportError[],
  ): Promise<(Competition & { created: boolean }) | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.competitions.upsert(data),
      item: data,
      errors,
      buildErrorMessage: CompetitionsImportService.errorMessage(data),
    });
  }
}
