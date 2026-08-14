import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertTrophy } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class TrophiesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  /**
   * Resolves to the upserted trophy (including its DB `id`) on success, or
   * `undefined` on failure — the caller records the id so later manual data
   * can cross-reference the trophy.
   */
  upsertTrophy(data: UpsertTrophy, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.trophies.upsert(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to import trophy "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
