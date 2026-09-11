import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  ComputeMissingTrophyAwards,
  ComputeMissingTrophyAwardsResult,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * The source-agnostic half of the computed-award step: call the
 * competition-scoped `trophyAwards.computeMissing` procedure and record a
 * per-competition error if the call itself fails. Mirrors
 * `MatchOutcomesImportService`, the other compute-in-place step.
 */
@Injectable()
export class MissingTrophyAwardsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  computeMissing(
    data: ComputeMissingTrophyAwards,
    errors: ImportError[],
  ): Promise<ComputeMissingTrophyAwardsResult | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.trophyAwards.computeMissing(data),
      item: { competitionId: data.competitionId },
      errors,
      buildErrorMessage: (err: unknown) =>
        `Failed to compute missing trophy awards for competition ${data.competitionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
    });
  }
}
