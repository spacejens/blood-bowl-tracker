import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

export interface UpsertPositionData {
  name: string;
  isStarPlayer: boolean;
  races: { raceId: number; isDeleted: boolean }[];
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class PositionsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertPosition(data: UpsertPositionData, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult(
      () => this.client.positions.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import position "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
