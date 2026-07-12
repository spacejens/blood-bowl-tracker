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

  upsertCompetition(
    data: UpsertCompetitionData,
    errors: ImportError[],
  ): Promise<boolean> {
    return this.importRunner.recordUpsert(
      () => this.client.competitions.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import competition "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
