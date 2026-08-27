import type { UpsertEra } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class ErasImportService extends createUpsertImportServiceBase({
  resource: (client) => client.eras,
  buildErrorMessage: (data: UpsertEra, err) =>
    `Failed to import era "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {}
