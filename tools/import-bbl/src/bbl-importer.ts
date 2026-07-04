import { makeImportError, makeImportResult } from '@blood-bowl-tracker/import';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import type { ApiClient } from '@blood-bowl-tracker/api-client';
import type { BblExport } from './bbl-types';

const BBL_EXTERNAL_SYSTEM_NAME = 'BBL';

export async function importBblData(
  data: BblExport,
  client: ApiClient,
): Promise<ImportResult> {
  let imported = 0;
  const errors: ImportError[] = [];

  const systemResponse = await client.externalSystems.upsert({
    body: { name: BBL_EXTERNAL_SYSTEM_NAME },
  });
  // The generated client types every HTTP status not explicitly declared on the route
  // with `body: unknown`, which collapses the declared 200/201 response body type to
  // `unknown` as well. The contract only declares 200/201 for this route, so this
  // reflects the real response shape.
  const externalSystemId = (systemResponse.body as { id: number }).id;

  for (const coach of data.coaches) {
    const response = await client.coaches.upsert({
      body: {
        name: coach.name,
        externalIds: [
          { externalSystemId, externalId: `id:${coach.id}` },
          {
            externalSystemId,
            externalId: `name:${coach.name.toLowerCase()}`,
          },
        ],
      },
    });

    if (response.status === 200 || response.status === 201) {
      imported += 1;
    } else {
      // Same `body: unknown` widening as above: the contract declares 409 with a
      // `{ message: string }` body for this route.
      const body = response.body as { message: string };
      errors.push(
        makeImportError({
          item: coach,
          message: `Failed to import coach "${coach.name}": ${body.message}`,
        }),
      );
    }
  }

  for (const team of data.teams) {
    // Team creation now requires a raceId (numeric ID from the races table), but BBL
    // source data only provides a string race name. Implement race lookup/creation
    // once the corresponding API endpoint is available. Coach resolution is already
    // handled above via coach upsert.
    errors.push(
      makeImportError({
        item: team,
        message: `Team import not yet implemented: requires race ID resolution for "${team.name}"`,
      }),
    );
  }

  return makeImportResult({ imported, errors });
}
