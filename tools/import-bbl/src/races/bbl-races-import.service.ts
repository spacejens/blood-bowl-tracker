import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  RacesImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblRaceNameService } from '../source/bbl-race-name.service';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
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
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
    private readonly pageParseError: PageParseErrorService,
    private readonly bblRaceName: BblRaceNameService,
  ) {}

  /**
   * Import every race found on the BBL team pages, plus any additional race
   * found only on the `tl` master race-list page (races with no team page,
   * e.g. College of Shadow/Light). The team-page pass runs first and is
   * authoritative on any shared id; the `tl` pass only fills gaps. Each race
   * is keyed by its numeric BBL id under the BBL external system (canonical)
   * and by its canonical name under the Name external system (cross-tool
   * matching). Idempotent: re-running upserts existing races.
   */
  async importRaces(): Promise<{
    result: ImportResult;
    racesByBblId: Map<string, { id: number; name: string }>;
    racesByRaceId: Map<number, UpsertRace>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const racesByBblId = new Map<string, { id: number; name: string }>();
    const racesByRaceId = new Map<number, UpsertRace>();

    const bblSystemName = this.externalSystemName.getBblSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: bblSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        racesByBblId,
        racesByRaceId,
      };
    }
    const [bblSystemId, nameSystemId] = bootstrap.ids;

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
            racesByBblId,
            racesByRaceId,
            errors,
          })
        ) {
          imported += 1;
        }
      } catch (error) {
        errors.push(this.pageParseError.build(page.params, 'team', error));
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
              racesByBblId,
              racesByRaceId,
              errors,
            })
          ) {
            imported += 1;
          }
        }
      } catch (error) {
        errors.push(this.pageParseError.build(page.params, 'race list', error));
        continue;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      racesByBblId,
      racesByRaceId,
    };
  }

  /**
   * Upsert one parsed race unless its BBL id was already seen. Records the race
   * under the BBL (numeric id) and Name (canonical name) external systems and
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
      racesByBblId,
      racesByRaceId,
      errors,
    } = options;
    if (seen.has(parsedRace.id)) {
      return false;
    }
    seen.add(parsedRace.id);

    // BBL names a race after its team page ("<Race> Team"); TP and this
    // project's canonical rows use the bare "<Race>". Canonicalize once and
    // use it for both the displayed name and the Name external id, so the
    // two sources key the same race to the same id instead of forking two
    // rows -- the race-level twin of the position keying in
    // BblPositionsImportService.raceExternalIds().
    const canonicalName = this.bblRaceName.canonical(parsedRace.name);
    const data: UpsertRace = {
      name: canonicalName,
      eras: [],
      externalIds: [
        { externalSystemId: bblSystemId, externalId: parsedRace.id },
        {
          externalSystemId: nameSystemId,
          externalId: this.nameExternalId.forRace(canonicalName),
        },
      ],
    };
    const upsertedRace = await this.racesImport.upsert(data, errors);
    if (!upsertedRace) {
      return false;
    }

    // Raw scraped name on purpose: downstream consumers of this map (e.g.
    // BblPositionsImportService) use it only for log/error text, and
    // re-canonicalize it themselves wherever it feeds a keying decision.
    racesByBblId.set(parsedRace.id, {
      id: upsertedRace.id,
      name: parsedRace.name,
    });
    racesByRaceId.set(upsertedRace.id, data);
    return true;
  }
}
