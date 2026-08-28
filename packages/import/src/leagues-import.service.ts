import type { UpsertLeague } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class LeaguesImportService extends createUpsertImportServiceBase({
  resource: (client) => client.leagues,
  buildErrorMessage: (data: UpsertLeague, err) =>
    `Failed to import league "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {}
