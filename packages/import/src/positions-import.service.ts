import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertPosition } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

export interface SyncPositionRaceErasData {
  positionId: number;
  raceEras: { raceId: number; eraId: number }[];
}

@Injectable()
export class PositionsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertPosition(data: UpsertPosition, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.positions.upsert(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to import position "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  syncRaceEras(data: SyncPositionRaceErasData, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.positions.syncRaceEras(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to sync race eras for position ${data.positionId}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
