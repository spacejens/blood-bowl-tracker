import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
  RacesImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import { RacePageParser } from './race-page-parser';

const TEAM_PAGE_TYPE = 'tm';

@Injectable()
export class BblRacesImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly racePageParser: RacePageParser,
    private readonly racesImport: RacesImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import every race found on the BBL team pages. Each race is keyed by its
   * numeric BBL id under the BBL external system (canonical) and by its exact
   * name under the Name external system (cross-tool matching). Idempotent:
   * re-running upserts existing races.
   */
  async importRaces(): Promise<{
    result: ImportResult;
    raceIdsByBblId: Map<string, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const raceIdsByBblId = new Map<string, number>();

    let bblSystemId: number;
    let nameSystemId: number;
    const bblSystemName = this.externalSystemName.getBblSystemName();
    try {
      bblSystemId =
        await this.externalSystemsImport.upsertExternalSystem(bblSystemName);
      nameSystemId = await this.externalSystemsImport.upsertExternalSystem(
        NAME_EXTERNAL_SYSTEM_NAME,
      );
    } catch (error) {
      errors.push(
        makeImportError({
          item: {
            externalSystems: [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME],
          },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: makeImportResult({ imported, errors }),
        raceIdsByBblId,
      };
    }

    const seen = new Set<string>();
    for await (const page of this.sourceReader.pages(TEAM_PAGE_TYPE)) {
      try {
        const race = this.racePageParser.extractRace(page);
        if (!race || seen.has(race.id)) {
          continue;
        }
        seen.add(race.id);

        const upsertedRace = await this.racesImport.upsertRace(
          {
            name: race.name,
            externalIds: [
              { externalSystemId: bblSystemId, externalId: race.id },
              { externalSystemId: nameSystemId, externalId: race.name },
            ],
          },
          errors,
        );
        if (upsertedRace) {
          raceIdsByBblId.set(race.id, upsertedRace.id);
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

    return {
      result: makeImportResult({ imported, errors }),
      raceIdsByBblId,
    };
  }
}
