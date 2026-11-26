import type { UpsertLeague } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class LeaguesImportService extends createUpsertImportServiceBase({
  resource: (client) => client.leagues,
  // A step that only attaches an external id to a curated league sends no
  // name, so the league is then named by its first external id.
  buildErrorMessage: (data: UpsertLeague, err) => {
    const label = data.name ?? data.externalIds.at(0)?.externalId;
    return `Failed to import league "${label}": ${err instanceof Error ? err.message : String(err)}`;
  },
}) {}
