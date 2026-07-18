import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class TeamsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertTeam(data: UpsertTeam, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.teams.upsert(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to import team "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
