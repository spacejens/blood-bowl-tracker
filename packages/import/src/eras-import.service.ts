import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertEra } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class ErasImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertEra(data: UpsertEra, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult(
      () => this.client.eras.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import era "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
