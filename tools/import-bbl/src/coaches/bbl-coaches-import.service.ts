import { Injectable } from '@nestjs/common';
import {
  CoachesImportService,
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
} from '@blood-bowl-tracker/import';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { BblSourceReader } from '../source/bbl-source-reader';
import { CoachPageParser } from './coach-page-parser';

const BBL_EXTERNAL_SYSTEM_NAME = 'BBL';
const NAME_EXTERNAL_SYSTEM_NAME = 'Name';
const TEAM_PAGE_TYPE = 'tm';

@Injectable()
export class BblCoachesImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly coachPageParser: CoachPageParser,
    private readonly coachesImport: CoachesImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
  ) {}

  /**
   * Import every coach found on the BBL team pages. Coaches are keyed by their
   * exact name under two external systems: BBL (canonical) and Name
   * (cross-tool matching). Idempotent: re-running upserts existing coaches.
   */
  async importCoaches(): Promise<ImportResult> {
    let imported = 0;
    const errors: ImportError[] = [];

    let bblSystemId: number;
    let nameSystemId: number;
    try {
      bblSystemId = await this.externalSystemsImport.upsertExternalSystem(
        BBL_EXTERNAL_SYSTEM_NAME,
      );
      nameSystemId = await this.externalSystemsImport.upsertExternalSystem(
        NAME_EXTERNAL_SYSTEM_NAME,
      );
    } catch (error) {
      errors.push(
        makeImportError({
          item: {
            externalSystems: [
              BBL_EXTERNAL_SYSTEM_NAME,
              NAME_EXTERNAL_SYSTEM_NAME,
            ],
          },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return makeImportResult({ imported, errors });
    }

    const seen = new Set<string>();
    for await (const page of this.sourceReader.pages(TEAM_PAGE_TYPE)) {
      try {
        const coach = this.coachPageParser.extractCoach(page);
        if (!coach || seen.has(coach.name)) {
          continue;
        }
        seen.add(coach.name);

        const success = await this.coachesImport.upsertCoach(
          {
            name: coach.name,
            externalIds: [
              { externalSystemId: bblSystemId, externalId: coach.name },
              { externalSystemId: nameSystemId, externalId: coach.name },
            ],
          },
          errors,
        );
        if (success) {
          imported += 1;
        }
      } catch (error) {
        errors.push(
          makeImportError({
            item: { page: page.params },
            message: `Failed to parse team page ${JSON.stringify(page.params)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          }),
        );
        continue;
      }
    }

    return makeImportResult({ imported, errors });
  }
}
