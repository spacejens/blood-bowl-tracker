import type {
  SyncPositionRaceEras,
  UpsertPosition,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { ImportError } from './types';
import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class PositionsImportService extends createUpsertImportServiceBase({
  resource: (client) => client.positions,
  buildErrorMessage: (data: UpsertPosition, err) =>
    `Failed to import position "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {
  syncRaceEras(data: SyncPositionRaceEras, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.positions.syncRaceEras(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to sync race eras for position ${data.positionId}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
