import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  FillIncompletePlayer,
  FillIncompletePlayerResult,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * Asks the server to fill in one missing TP player's data
 * (`players.fillIncomplete`), recording a refusal or failure as one
 * ImportError instead of ending the run. One call per player: the server
 * checks and writes each fill on its own.
 */
@Injectable()
export class IncompletePlayerFillImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  /** The server's outcome, or undefined after recording the failure in `errors`. */
  fill(
    data: FillIncompletePlayer,
    errors: ImportError[],
  ): Promise<FillIncompletePlayerResult | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.players.fillIncomplete(data),
      item: data,
      errors,
      buildErrorMessage: (err: unknown) =>
        `Failed to fill in player ${data.playerId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
    });
  }
}
