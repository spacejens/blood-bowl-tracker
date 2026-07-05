import { Inject, Injectable } from '@nestjs/common';
import { ImportRunnerService } from '@blood-bowl-tracker/import';
import { makeImportError, makeImportResult } from '@blood-bowl-tracker/import';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { ApiClient } from '@blood-bowl-tracker/api-client';
import type { BblExport } from './bbl-types';

const BBL_EXTERNAL_SYSTEM_NAME = 'BBL';

@Injectable()
export class BblCoachesImportService {
  constructor(
    private readonly importRunner: ImportRunnerService,
    @Inject(API_CLIENT) private readonly client: ApiClient,
  ) {}

  async importBblData(data: BblExport): Promise<ImportResult> {
    let imported = 0;
    const errors: ImportError[] = [];
    let externalSystemId: number | undefined;

    try {
      externalSystemId = await this.importRunner.upsertExternalSystem(
        async () => {
          // The generated ts-rest client widens this response to a union
          // covering every HTTP status code (with `body: unknown` for the
          // ones the contract doesn't declare), since `strictStatusCodes`
          // isn't set. Only 200/201 are actually returned by this route, so
          // narrow the type at this boundary without changing behavior.
          const response = await this.client.externalSystems.upsert({
            body: { name: BBL_EXTERNAL_SYSTEM_NAME },
          });
          return response as unknown as {
            status: number;
            body: { id: number };
          };
        },
        BBL_EXTERNAL_SYSTEM_NAME,
      );
    } catch (error) {
      errors.push(
        makeImportError({
          item: { name: BBL_EXTERNAL_SYSTEM_NAME },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    if (externalSystemId !== undefined) {
      for (const coach of data.coaches) {
        const response = await this.client.coaches.upsert({
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

        const success = this.importRunner.recordUpsert(
          response,
          coach,
          errors,
          // Same `body: unknown` widening as `upsertExternalSystem`: the
          // contract declares 409 with a `{ message: string }` body for
          // this route.
          (body) =>
            `Failed to import coach "${coach.name}": ${(body as { message: string }).message}`,
        );
        if (success) {
          imported += 1;
        }
      }
    }

    for (const team of data.teams) {
      // Team creation now requires a raceId (numeric ID from the races
      // table), but BBL source data only provides a string race name.
      // Implement race lookup/creation once the corresponding API endpoint
      // is available. Coach resolution is already handled above via coach
      // upsert.
      errors.push(
        makeImportError({
          item: team,
          message: `Team import not yet implemented: requires race ID resolution for "${team.name}"`,
        }),
      );
    }

    return makeImportResult({ imported, errors });
  }
}
