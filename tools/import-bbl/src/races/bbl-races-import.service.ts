import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
  RacesImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblSourceReader } from '../source/bbl-source-reader';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  NAME_EXTERNAL_SYSTEM_NAME,
} from '../source/external-system-names';
import { RacePageParser } from './race-page-parser';

const TEAM_PAGE_TYPE = 'tm';

@Injectable()
export class BblRacesImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly racePageParser: RacePageParser,
    private readonly racesImport: RacesImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
  ) {}

  /**
   * Import every race found on the BBL team pages. Each race is keyed by its
   * numeric BBL id under the BBL external system (canonical) and by its exact
   * name under the Name external system (cross-tool matching). Idempotent:
   * re-running upserts existing races.
   */
  async importRaces(): Promise<ImportResult> {
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
        const race = this.racePageParser.extractRace(page);
        if (!race || seen.has(race.id)) {
          continue;
        }
        seen.add(race.id);

        const success = await this.racesImport.upsertRace(
          {
            name: race.name,
            externalIds: [
              { externalSystemId: bblSystemId, externalId: race.id },
              { externalSystemId: nameSystemId, externalId: race.name },
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
