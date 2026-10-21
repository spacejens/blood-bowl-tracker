import type { UpsertKeyword } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

/** A keyword is a name and a kind. */
@Injectable()
export class KeywordsImportService extends createUpsertImportServiceBase({
  resource: (client) => client.keywords,
  buildErrorMessage: (data: UpsertKeyword, err) =>
    `Failed to import keyword "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {}
