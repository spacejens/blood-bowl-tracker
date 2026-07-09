import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

export interface UpsertCoachData {
  name: string;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class CoachesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertCoach(data: UpsertCoachData, errors: ImportError[]): Promise<boolean> {
    return this.importRunner.recordUpsert(
      () => this.client.coaches.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import coach "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
