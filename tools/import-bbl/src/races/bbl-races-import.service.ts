import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  externalSystemBootstrapError,
  ExternalSystemsImportService,
  makeImportResult,
  RacesImportService,
  upsertExternalSystems,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import { pageParseError } from '../source/page-parse-error';
import { RaceListPageParser } from './race-list-page-parser';
import type { BblRace } from './race-page-parser';
import { RacePageParser } from './race-page-parser';

const TEAM_PAGE_TYPE = 'tm';
const RACE_LIST_PAGE_TYPE = 'tl';

interface UpsertParsedRaceOptions {
  parsedRace: BblRace;
  seen: Set<string>;
  bblSystemId: number;
  nameSystemId: number;
  raceIdsByBblId: Map<string, number>;
  racesByBblId: Map<string, { id: number; name: string }>;
  racesByRaceId: Map<number, UpsertRace>;
  errors: ImportError[];
}

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
   * Import every race found on the BBL team pages, plus any additional race
   * found only on the `tl` master race-list page (races with no team page,
   * e.g. College of Shadow/Light). The team-page pass runs first and is
   * authoritative on any shared id; the `tl` pass only fills gaps. Each race
   * is keyed by its numeric BBL id under the BBL external system (canonical)
   * and by its exact name under the Name external system (cross-tool
   * matching). Idempotent: re-running upserts existing races.
   */
  async importRaces(): Promise<{
    result: ImportResult;
    raceIdsByBblId: Map<string, number>;
    racesByBblId: Map<string, { id: number; name: string }>;
    racesByRaceId: Map<number, UpsertRace>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const raceIdsByBblId = new Map<string, number>();
    const racesByBblId = new Map<string, { id: number; name: string }>();
    const racesByRaceId = new Map<number, UpsertRace>();

    let bblSystemId: number;
    let nameSystemId: number;
    const bblSystemName = this.externalSystemName.getBblSystemName();
    try {
      [bblSystemId, nameSystemId] = await upsertExternalSystems(
        this.externalSystemsImport,
        [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME],
      );
    } catch (error) {
      errors.push(
        externalSystemBootstrapError(
          [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME],
          error,
        ),
      );
      return {
        result: makeImportResult({ imported, errors }),
        raceIdsByBblId,
        racesByBblId,
        racesByRaceId,
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
          await this.upsertParsedRace({
            parsedRace,
            seen,
            bblSystemId,
            nameSystemId,
            raceIdsByBblId,
            racesByBblId,
            racesByRaceId,
            errors,
          })
        ) {
          imported += 1;
        }
      } catch (error) {
        errors.push(pageParseError(page.params, 'team', error));
        continue;
      }
    }

    for await (const page of this.sourceReader.pages(RACE_LIST_PAGE_TYPE)) {
      try {
        for (const parsedRace of this.raceListPageParser.extractRaces(page)) {
          if (
            await this.upsertParsedRace({
              parsedRace,
              seen,
              bblSystemId,
              nameSystemId,
              raceIdsByBblId,
              racesByBblId,
              racesByRaceId,
              errors,
            })
          ) {
            imported += 1;
          }
        }
      } catch (error) {
        errors.push(pageParseError(page.params, 'race list', error));
        continue;
      }
    }

    return {
      result: makeImportResult({ imported, errors }),
      raceIdsByBblId,
      racesByBblId,
      racesByRaceId,
    };
  }

  /**
   * Upsert one parsed race unless its BBL id was already seen. Records the race
   * under the BBL (numeric id) and Name (exact name) external systems and
   * populates the id/name/data maps (the last keyed by the race's local id, so
   * callers can re-upsert it later with an updated `eras` list). Returns true
   * iff a new race was upserted, so the caller can increment its `imported`
   * counter. Shared by the team-page and race-list passes so both key races
   * identically.
   */
  private async upsertParsedRace(
    options: UpsertParsedRaceOptions,
  ): Promise<boolean> {
    const {
      parsedRace,
      seen,
      bblSystemId,
      nameSystemId,
      raceIdsByBblId,
      racesByBblId,
      racesByRaceId,
      errors,
    } = options;
    if (seen.has(parsedRace.id)) {
      return false;
    }
    seen.add(parsedRace.id);

    const data: UpsertRace = {
      name: parsedRace.name,
      eras: [],
      externalIds: [
        { externalSystemId: bblSystemId, externalId: parsedRace.id },
        { externalSystemId: nameSystemId, externalId: parsedRace.name },
      ],
    };
    const upsertedRace = await this.racesImport.upsertRace(data, errors);
    if (!upsertedRace) {
      return false;
    }

    raceIdsByBblId.set(parsedRace.id, upsertedRace.id);
    racesByBblId.set(parsedRace.id, {
      id: upsertedRace.id,
      name: parsedRace.name,
    });
    racesByRaceId.set(upsertedRace.id, data);
    return true;
  }
}
