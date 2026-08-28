import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class TeamsImportService extends createUpsertImportServiceBase({
  resource: (client) => client.teams,
  buildErrorMessage: (data: UpsertTeam, err) =>
    `Failed to import team "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {}
