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

  private static errorMessage(data: UpsertPlayerData) {
    return (err: unknown): string =>
      `Failed to import player "${data.name}": ${err instanceof Error ? err.message : String(err)}`;
  }

  upsertPlayer(
    data: UpsertPlayerData,
    errors: ImportError[],
  ): Promise<boolean> {
    return this.importRunner.recordUpsert(
      () => this.client.players.upsert(data),
      data,
      errors,
      PlayersImportService.errorMessage(data),
    );
  }

  /**
   * Like {@link upsertPlayer}, but resolves to the upserted player
   * (including its DB `id`) on success, or `undefined` on failure. Used
   * where the caller needs the player's DB id (e.g. to link match events to
   * them).
   */
  upsertPlayerResult(
    data: UpsertPlayerData,
    errors: ImportError[],
  ): Promise<{ id: number } | undefined> {
    return this.importRunner.recordUpsertResult(
      () => this.client.players.upsert(data),
      data,
      errors,
      PlayersImportService.errorMessage(data),
    );
  }
}
