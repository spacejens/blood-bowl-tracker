import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

export interface UpsertEraData {
  name: string;
  leagueId: number;
  rulesSetId: number;
  startDate: string;
  endDate?: string;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class ErasImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertEra(data: UpsertEraData, errors: ImportError[]): Promise<boolean> {
    return this.importRunner.recordUpsert(
      () => this.client.eras.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import era "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
