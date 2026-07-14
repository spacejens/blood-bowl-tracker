import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

export interface UpsertMatchData {
  competitionId: number;
  playedAt: Date;
  name: string;
  externalIds: { externalSystemId: number; externalId: string }[];
  teamEraIds?: number[];
}

@Injectable()
export class MatchesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertMatch(data: UpsertMatchData, errors: ImportError[]): Promise<boolean> {
    const bblId = data.externalIds[0]?.externalId;
    return this.importRunner.recordUpsert(
      () => this.client.matches.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import match "${bblId}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  /**
   * Like {@link upsertMatch}, but resolves to the upserted match (including
   * its DB `id`) on success, or `undefined` on failure. Used where the
   * caller needs the match's DB id (e.g. to link match events to it).
   */
  upsertMatchResult(
    data: UpsertMatchData,
    errors: ImportError[],
  ): Promise<{ id: number } | undefined> {
    const bblId = data.externalIds[0]?.externalId;
    return this.importRunner.recordUpsertResult(
      () => this.client.matches.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import match "${bblId}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
