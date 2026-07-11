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
import { RaceListPageParser } from './race-list-page-parser';
import type { BblRace } from './race-page-parser';
import { RacePageParser } from './race-page-parser';

const TEAM_PAGE_TYPE = 'tm';
const RACE_LIST_PAGE_TYPE = 'tl';

@Injectable()
export class BblRacesImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly racePageParser: RacePageParser,
    private readonly raceListPageParser: RaceListPageParser,
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
    racesByBblId: Map<string, { id: number; name: string }>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const raceIdsByBblId = new Map<string, number>();
    const racesByBblId = new Map<string, { id: number; name: string }>();

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
        racesByBblId,
      };
    }

    const seen = new Set<string>();
    for await (const page of this.sourceReader.pages(TEAM_PAGE_TYPE)) {
      try {
        const parsedRace = this.racePageParser.extractRace(page);
        if (!parsedRace) {
          continue;
        }
        if (
          await this.upsertParsedRace(
            parsedRace,
            seen,
            bblSystemId,
            nameSystemId,
            raceIdsByBblId,
            racesByBblId,
            errors,
          )
        ) {
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

    for await (const page of this.sourceReader.pages(RACE_LIST_PAGE_TYPE)) {
      try {
        for (const parsedRace of this.raceListPageParser.extractRaces(page)) {
          if (
            await this.upsertParsedRace(
              parsedRace,
              seen,
              bblSystemId,
              nameSystemId,
              raceIdsByBblId,
              racesByBblId,
              errors,
            )
          ) {
            imported += 1;
          }
        }
      } catch (error) {
        errors.push(
          makeImportError({
            item: { page: page.params },
            message: `Failed to parse race list page ${JSON.stringify(page.params)}: ${
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
      racesByBblId,
    };
  }

  /**
   * Upsert one parsed race unless its BBL id was already seen. Records the race
   * under the BBL (numeric id) and Name (exact name) external systems and
   * populates the id/name maps. Returns true iff a new race was upserted, so the
   * caller can increment its `imported` counter. Shared by the team-page and
   * race-list passes so both key races identically.
   */
  private async upsertParsedRace(
    parsedRace: BblRace,
    seen: Set<string>,
    bblSystemId: number,
    nameSystemId: number,
    raceIdsByBblId: Map<string, number>,
    racesByBblId: Map<string, { id: number; name: string }>,
    errors: ImportError[],
  ): Promise<boolean> {
    if (seen.has(parsedRace.id)) {
      return false;
    }
    seen.add(parsedRace.id);

    const upsertedRace = await this.racesImport.upsertRace(
      {
        name: parsedRace.name,
        externalIds: [
          { externalSystemId: bblSystemId, externalId: parsedRace.id },
          { externalSystemId: nameSystemId, externalId: parsedRace.name },
        ],
      },
      errors,
    );
    if (!upsertedRace) {
      return false;
    }

    raceIdsByBblId.set(parsedRace.id, upsertedRace.id);
    racesByBblId.set(parsedRace.id, {
      id: upsertedRace.id,
      name: parsedRace.name,
    });
    return true;
  }
}
