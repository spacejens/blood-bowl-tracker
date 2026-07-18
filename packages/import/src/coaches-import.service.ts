import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertCoach } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class CoachesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertCoach(data: UpsertCoach, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.coaches.upsert(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to import coach "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
