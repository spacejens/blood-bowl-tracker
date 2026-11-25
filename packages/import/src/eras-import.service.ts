import type { UpsertEra } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class ErasImportService extends createUpsertImportServiceBase({
  resource: (client) => client.eras,
  // A step that only attaches an external id to a curated era sends no name,
  // so the era is then named by its first external id.
  buildErrorMessage: (data: UpsertEra, err) => {
    const label = data.name ?? data.externalIds.at(0)?.externalId;
    return `Failed to import era "${label}": ${err instanceof Error ? err.message : String(err)}`;
  },
}) {}
