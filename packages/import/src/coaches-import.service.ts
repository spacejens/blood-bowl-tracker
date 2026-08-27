import type { UpsertCoach } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class CoachesImportService extends createUpsertImportServiceBase({
  resource: (client) => client.coaches,
  buildErrorMessage: (data: UpsertCoach, err) =>
    `Failed to import coach "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {}
