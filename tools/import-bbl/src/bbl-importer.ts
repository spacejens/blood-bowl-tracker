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

  if (systemResponse.status === 200 || systemResponse.status === 201) {
    const externalSystemId = systemResponse.body.id;

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
  } else {
    // The external system upsert failed, so there's no valid externalSystemId to
    // attach to any coach. Skip the coach loop entirely rather than upserting every
    // coach with an undefined externalSystemId, which would otherwise surface as N
    // confusing per-coach validation failures instead of one clear root cause.
    errors.push(
      makeImportError({
        item: { name: BBL_EXTERNAL_SYSTEM_NAME },
        message: `Failed to upsert BBL external system: unexpected status ${systemResponse.status}`,
      }),
    );
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
