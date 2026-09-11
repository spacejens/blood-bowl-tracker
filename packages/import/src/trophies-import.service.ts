import type { UpsertTrophy } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { ImportError } from './types';
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
}) {
  /**
   * Which trophy carries this exact curated name, or `undefined` when none
   * does (or the call itself failed, which records an ImportError). Trophies
   * are looked up by name rather than external id because they carry no
   * shared "Name"-system id — see the contract's `trophies.resolveByName`.
   *
   * Reuses recordUpsertResult even though this is a read, for the same
   * reason `CompetitionGroupsImportService.listCompetitionGroups` does: the
   * helper is "run this call, record a failure as an ImportError, return
   * undefined", and nothing about it is upsert-specific beyond its name. A
   * name that simply matches nothing is not a failure here — it resolves to
   * `{ found: false }`, which this reports as `undefined` with no error, so
   * the caller can word the miss in its own terms.
   */
  async resolveByName(
    name: string,
    errors: ImportError[],
  ): Promise<number | undefined> {
    const result = await this.importRunner.recordUpsertResult({
      upsert: () => this.client.trophies.resolveByName({ name }),
      item: { trophyName: name },
      errors,
      buildErrorMessage: (err) =>
        `Failed to resolve trophy "${name}": ${err instanceof Error ? err.message : String(err)}`,
    });
    return result !== undefined && result.found ? result.id : undefined;
  }
}
