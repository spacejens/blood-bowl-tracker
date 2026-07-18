import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class MatchEventsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertMatchEvent(
    data: UpsertMatchEvent,
    errors: ImportError[],
  ): Promise<boolean> {
    const externalId = data.externalIds[0]?.externalId;
    return this.importRunner.recordUpsert(
      () => this.client.matchEvents.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import match event "${externalId}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
