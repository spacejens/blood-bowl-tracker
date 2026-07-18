import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertMatch } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class MatchesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  private static errorMessage(data: UpsertMatch) {
    const bblId = data.externalIds[0]?.externalId;
    return (err: unknown): string =>
      `Failed to import match "${bblId}": ${err instanceof Error ? err.message : String(err)}`;
  }

  upsertMatch(data: UpsertMatch, errors: ImportError[]): Promise<boolean> {
    return this.importRunner.recordUpsert(
      () => this.client.matches.upsert(data),
      data,
      errors,
      MatchesImportService.errorMessage(data),
    );
  }

  /**
   * Like {@link upsertMatch}, but resolves to the upserted match (including
   * its DB `id`) on success, or `undefined` on failure. Used where the
   * caller needs the match's DB id (e.g. to link match events to it).
   */
  upsertMatchResult(
    data: UpsertMatch,
    errors: ImportError[],
  ): Promise<{ id: number } | undefined> {
    return this.importRunner.recordUpsertResult(
      () => this.client.matches.upsert(data),
      data,
      errors,
      MatchesImportService.errorMessage(data),
    );
  }
}
