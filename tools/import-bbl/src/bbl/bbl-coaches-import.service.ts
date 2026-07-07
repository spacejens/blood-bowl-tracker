import { Injectable } from '@nestjs/common';
import {
  CoachesImportService,
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
} from '@blood-bowl-tracker/import';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import type { BblExport } from './bbl-types';

const BBL_EXTERNAL_SYSTEM_NAME = 'BBL';

@Injectable()
export class BblCoachesImportService {
  constructor(
    private readonly coachesImport: CoachesImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
  ) {}

  async importBblData(data: BblExport): Promise<ImportResult> {
    let imported = 0;
    const errors: ImportError[] = [];
    let externalSystemId: number | undefined;

    try {
      externalSystemId = await this.externalSystemsImport.upsertExternalSystem(
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
        const success = await this.coachesImport.upsertCoach(
          {
            name: coach.name,
            externalIds: [
              { externalSystemId, externalId: `id:${coach.id}` },
              {
                externalSystemId,
                externalId: `name:${coach.name.toLowerCase()}`,
              },
            ],
          },
          errors,
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
