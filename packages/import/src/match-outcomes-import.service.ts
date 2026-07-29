import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  ResolveMatchOutcomes,
  ResolveMatchOutcomesResult,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * The source-agnostic half of the outcome step: call the competition-scoped
 * `matches.resolveOutcomes` procedure and record a per-competition error if
 * the call itself fails. Interpreting `unresolvedMatchIds` is left to each
 * importer, which alone can name the source's own match id in the message.
 */
@Injectable()
export class MatchOutcomesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  resolveOutcomes(
    data: ResolveMatchOutcomes,
    errors: ImportError[],
  ): Promise<ResolveMatchOutcomesResult | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.matches.resolveOutcomes(data),
      item: { competitionId: data.competitionId },
      errors,
      buildErrorMessage: (err: unknown) =>
        `Failed to resolve match outcomes for competition ${data.competitionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
    });
  }
}
