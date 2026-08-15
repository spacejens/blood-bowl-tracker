import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertTrophyAward } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class TrophyAwardsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  /**
   * Resolves to the upserted award (including its DB `id` and `created`
   * flag) on success, or `undefined` on failure. An award row has no name of
   * its own, so a failure is identified by the ids it links.
   */
  upsertTrophyAward(data: UpsertTrophyAward, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.trophyAwards.upsert(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to import trophy award (trophy ${data.trophyId}, ` +
        `competition ${data.competitionId}, team era ${data.teamEraId}, ` +
        `${data.playerId === null ? 'no player' : `player ${data.playerId}`}): ` +
        `${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
