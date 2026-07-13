import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  ActionType,
  ConsequenceType,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

export interface UpsertMatchEventData {
  matchId: number;
  actingTeamEraId?: number;
  consequenceTeamEraId?: number;
  actingPlayerId?: number;
  consequencePlayerId?: number;
  actionType?: ActionType;
  consequenceType?: ConsequenceType;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class MatchEventsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertMatchEvent(
    data: UpsertMatchEventData,
    errors: ImportError[],
  ): Promise<boolean> {
    const externalId = data.externalIds[0]?.externalId;
    return this.importRunner.recordUpsert(
      () => this.client.matchEvents.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import match event "${externalId}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
