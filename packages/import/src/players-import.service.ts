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
   * Like {@link upsertPlayer}, but resolves to the upserted player's DB `id`
   * and whether this call INSERTED the row, or `undefined` on failure. Used
   * where the caller needs the player's DB id (e.g. to link match events to
   * them), and where it needs to know which players were fresh this run (the
   * lasting-injury history backfill, which must not re-manufacture history
   * for a player that already has some).
   */
  upsertPlayerResult(
    data: UpsertPlayer,
    errors: ImportError[],
  ): Promise<{ id: number; created: boolean } | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.players.upsert(data),
      item: data,
      errors,
      buildErrorMessage: PlayersImportService.errorMessage(data),
    });
  }
}
