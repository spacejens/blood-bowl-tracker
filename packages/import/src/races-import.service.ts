import type { OngoingEra, UpsertRace } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { ImportError } from './types';
import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class RacesImportService extends createUpsertImportServiceBase({
  resource: (client) => client.races,
  buildErrorMessage: (data: UpsertRace, err) =>
    `Failed to import race "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {
  /**
   * The race's ongoing eras (no end date), for a caller choosing an era for
   * a team it was not told one for. Resolves to undefined (with an error
   * recorded) when the call fails.
   *
   * Reuses recordUpsertResult even though this is a read, as
   * CompetitionGroupsImportService.listCompetitionGroups does: the helper is
   * "run this call, record a failure as an ImportError, return undefined".
   */
  listOngoingEras(
    raceId: number,
    errors: ImportError[],
  ): Promise<OngoingEra[] | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.races.listOngoingEras({ raceId }),
      item: { race: raceId, ongoingEras: 'list' },
      errors,
      buildErrorMessage: (err) =>
        `Failed to list ongoing eras for race ${raceId}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
