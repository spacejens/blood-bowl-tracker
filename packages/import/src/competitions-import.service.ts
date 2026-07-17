import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

export interface UpsertCompetitionData {
  name: string;
  type: 'season' | 'cup';
  eraId: number;
  teamEraIds?: number[];
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class CompetitionsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  private static errorMessage(data: UpsertCompetitionData) {
    return (err: unknown): string =>
      `Failed to import competition "${data.name}": ${err instanceof Error ? err.message : String(err)}`;
  }

  upsertCompetition(
    data: UpsertCompetitionData,
    errors: ImportError[],
  ): Promise<boolean> {
    return this.importRunner.recordUpsert(
      () => this.client.competitions.upsert(data),
      data,
      errors,
      CompetitionsImportService.errorMessage(data),
    );
  }

  /**
   * Like {@link upsertCompetition}, but resolves to the upserted competition
   * (including its DB `id`) on success, or `undefined` on failure. Used where
   * the caller needs the competition's DB id (e.g. to link matches to it).
   */
  upsertCompetitionResult(
    data: UpsertCompetitionData,
    errors: ImportError[],
  ): Promise<{ id: number } | undefined> {
    return this.importRunner.recordUpsertResult(
      () => this.client.competitions.upsert(data),
      data,
      errors,
      CompetitionsImportService.errorMessage(data),
    );
  }
}
