import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

export interface UpsertLeagueData {
  name: string;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class LeaguesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertLeague(
    data: UpsertLeagueData,
    errors: ImportError[],
  ): Promise<boolean> {
    return this.importRunner.recordUpsert(
      () => this.client.leagues.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import league "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
