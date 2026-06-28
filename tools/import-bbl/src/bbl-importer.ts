import { makeImportError, makeImportResult } from '@blood-bowl-tracker/import';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import type { ApiClient } from '@blood-bowl-tracker/api-client';
import type { BblExport } from './bbl-types';

export async function importBblData(
  data: BblExport,
  client: ApiClient,
): Promise<ImportResult> {
  let imported = 0;
  const errors: ImportError[] = [];

  for (const team of data.teams) {
    const response = await client.teams.create({
      body: { name: team.name, race: team.race, coach: team.coachName },
    });
    if (response.status === 201) {
      imported++;
    } else {
      errors.push(makeImportError({ item: team, message: `Failed to import team "${team.name}"` }));
    }
  }

  return makeImportResult({ imported, errors });
}
