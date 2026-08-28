import type {
  CompetitionGroup,
  UpsertCompetitionGroup,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { ImportError } from './types';
import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class CompetitionGroupsImportService extends createUpsertImportServiceBase(
  {
    resource: (client) => client.competitionGroups,
    buildErrorMessage: (data: UpsertCompetitionGroup, err) =>
      `Failed to import competition group "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
  },
) {
  /**
   * Every curated competition group, so an importer can map a competition's
   * competitionGroupId back to the group's curated name. Resolves to
   * undefined (with an error recorded) when the call fails.
   *
   * Reuses recordUpsertResult even though this is a read: the helper is
   * "run this call, record a failure as an ImportError, return undefined" --
   * nothing about it is upsert-specific beyond the option's name.
   */
  listCompetitionGroups(
    errors: ImportError[],
  ): Promise<CompetitionGroup[] | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.competitionGroups.list({}),
      item: { competitionGroups: 'list' },
      errors,
      buildErrorMessage: (err) =>
        `Failed to list competition groups: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
