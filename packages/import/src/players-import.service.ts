import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertPlayer } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class PlayersImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  private static errorMessage(data: UpsertPlayer) {
    return (err: unknown): string =>
      `Failed to import player "${data.name}": ${err instanceof Error ? err.message : String(err)}`;
  }

  upsertPlayer(data: UpsertPlayer, errors: ImportError[]): Promise<boolean> {
    return this.importRunner.recordUpsert({
      upsert: () => this.client.players.upsert(data),
      item: data,
      errors,
      buildErrorMessage: PlayersImportService.errorMessage(data),
    });
  }

  /**
   * Like {@link upsertPlayer}, but resolves to the upserted player
   * (including its DB `id`) on success, or `undefined` on failure. Used
   * where the caller needs the player's DB id (e.g. to link match events to
   * them).
   */
  upsertPlayerResult(
    data: UpsertPlayer,
    errors: ImportError[],
  ): Promise<{ id: number } | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.players.upsert(data),
      item: data,
      errors,
      buildErrorMessage: PlayersImportService.errorMessage(data),
    });
  }
}
