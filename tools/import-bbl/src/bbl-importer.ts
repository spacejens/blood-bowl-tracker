import { makeImportError, makeImportResult } from '@blood-bowl-tracker/import';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import type { ApiClient } from '@blood-bowl-tracker/api-client';
import type { BblExport } from './bbl-types';

export function importBblData(
  data: BblExport,
  _client: ApiClient,
): Promise<ImportResult> {
  const imported = 0;
  const errors: ImportError[] = [];

  for (const team of data.teams) {
    // Team creation now requires raceId and coachId (numeric IDs from the races and coaches
    // tables), but BBL source data only provides string names. Implement race/coach
    // lookup/creation once the corresponding API endpoints are available.
    errors.push(
      makeImportError({
        item: team,
        message: `Team import not yet implemented: requires race and coach ID resolution for "${team.name}"`,
      }),
    );
  }

  return Promise.resolve(makeImportResult({ imported, errors }));
}
