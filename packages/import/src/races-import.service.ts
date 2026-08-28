import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class RacesImportService extends createUpsertImportServiceBase({
  resource: (client) => client.races,
  buildErrorMessage: (data: UpsertRace, err) =>
    `Failed to import race "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {}
