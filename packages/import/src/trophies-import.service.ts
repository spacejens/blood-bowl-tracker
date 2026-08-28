import type { UpsertTrophy } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

/**
 * Resolves to the upserted trophy (including its DB id) on success, or
 * undefined on failure — the caller records the id so later manual data can
 * cross-reference the trophy.
 */
@Injectable()
export class TrophiesImportService extends createUpsertImportServiceBase({
  resource: (client) => client.trophies,
  buildErrorMessage: (data: UpsertTrophy, err) =>
    // A trophy *resolution* call (tools/import-bbl looking a trophy up by its
    // BBL label) carries only external ids and no name, so fall back to the
    // label rather than printing "undefined".
    `Failed to import trophy "${data.name ?? data.externalIds[0]?.externalId ?? '(unnamed)'}": ${err instanceof Error ? err.message : String(err)}`,
}) {}
