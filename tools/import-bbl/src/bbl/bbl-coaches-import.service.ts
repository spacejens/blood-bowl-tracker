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
        () =>
          this.client.externalSystems.upsert({
            name: BBL_EXTERNAL_SYSTEM_NAME,
          }),
        BBL_EXTERNAL_SYSTEM_NAME,
      );
    } catch (error) {
      // ImportRunnerService.upsertExternalSystem always rejects with an
      // Error it constructs itself, so the non-Error fallback below is
      // unreachable in practice; it's kept only for type safety.
      errors.push(
        makeImportError({
          item: { name: BBL_EXTERNAL_SYSTEM_NAME },
          message:
            error instanceof Error
              ? error.message
              : /* v8 ignore next */ String(error),
        }),
      );
    }

    if (externalSystemId !== undefined) {
      for (const coach of data.coaches) {
        const success = await this.importRunner.recordUpsert(
          () =>
            this.client.coaches.upsert({
              name: coach.name,
              externalIds: [
                { externalSystemId, externalId: `id:${coach.id}` },
                {
                  externalSystemId,
                  externalId: `name:${coach.name.toLowerCase()}`,
                },
              ],
            }),
          coach,
          errors,
          (error) =>
            `Failed to import coach "${coach.name}": ${error instanceof Error ? error.message : String(error)}`,
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
