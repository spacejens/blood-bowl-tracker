import type {
  KeywordCatalogEntry,
  UpsertKeyword,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { ImportError } from './types';
import { createUpsertImportServiceBase } from './upsert-import-service-base';

/**
 * A keyword is a name and a kind. `listKeywords` reads the whole curated
 * catalogue keyed by one external system's ids -- the only way an importer
 * that holds numeric codes can name them, since no imported source publishes
 * keyword names at all.
 */
@Injectable()
export class KeywordsImportService extends createUpsertImportServiceBase({
  resource: (client) => client.keywords,
  buildErrorMessage: (data: UpsertKeyword, err) =>
    `Failed to import keyword "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {
  listKeywords(
    externalSystemId: number,
    errors: ImportError[],
  ): Promise<KeywordCatalogEntry[] | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.keywords.list({ externalSystemId }),
      item: { externalSystemId },
      errors,
      buildErrorMessage: (err) =>
        `Failed to read the keyword catalogue: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
