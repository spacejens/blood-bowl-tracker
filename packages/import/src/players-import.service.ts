import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

export interface UpsertPlayerData {
  name: string;
  teamEraId: number;
  positionId: number;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class PlayersImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertPlayer(
    data: UpsertPlayerData,
    errors: ImportError[],
  ): Promise<boolean> {
    return this.importRunner.recordUpsert(
      () => this.client.players.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import player "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
