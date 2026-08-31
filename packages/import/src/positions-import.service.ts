import type {
  PositionRaceEraCharacteristics,
  UpsertPosition,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { ImportError } from './types';
import { createUpsertImportServiceBase } from './upsert-import-service-base';

export interface SyncPositionRaceErasData {
  positionId: number;
  raceEras: {
    raceId: number;
    eraId: number;
    /**
     * The position's characteristics for this race era, when the source
     * knows them. Omitted entries record availability only and leave the
     * characteristics columns at their database defaults.
     */
    characteristics?: PositionRaceEraCharacteristics;
  }[];
}

@Injectable()
export class PositionsImportService extends createUpsertImportServiceBase({
  resource: (client) => client.positions,
  buildErrorMessage: (data: UpsertPosition, err) =>
    `Failed to import position "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {
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
