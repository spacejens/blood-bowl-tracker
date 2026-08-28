import type { UpsertTrophyAward } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

/**
 * Resolves to the upserted award (including its DB id and created flag) on
 * success, or undefined on failure. An award row has no name of its own, so a
 * failure is identified by the ids it links.
 */
@Injectable()
export class TrophyAwardsImportService extends createUpsertImportServiceBase({
  resource: (client) => client.trophyAwards,
  buildErrorMessage: (data: UpsertTrophyAward, err) =>
    `Failed to import trophy award (trophy ${data.trophyId}, ` +
    `competition ${data.competitionId}, team era ${data.teamEraId}, ` +
    `${data.playerId === null ? 'no player' : `player ${data.playerId}`}): ` +
    `${err instanceof Error ? err.message : String(err)}`,
}) {}
