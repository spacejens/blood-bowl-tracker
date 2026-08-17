import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  RacesImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraDataConfigService } from '../eras/era-data-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { RosterCollectionService } from '../source/roster-collection.service';

/** One logical race, accumulated across every roster file that names it. */
interface RaceGroup {
  raceName: string;
  codes: Set<string>;
  eraIds: Set<number>;
}

@Injectable()
export class TpRacesImportService {
  constructor(
    private readonly racesImport: RacesImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly rosterCollection: RosterCollectionService,
    private readonly importResults: ImportResultService,
    private readonly eraDataConfig: EraDataConfigService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Import every race that appears on a TP roster file. Rosters are grouped by
   * `rosterMaster.name` (the display name), NOT by `teamRace` code, because one
   * logical race can carry several rule-set-variant codes. Each group upserts
   * once, carrying every distinct code as a TP external id (all in one call, so
   * the merge semantics collapse them onto a single row), the display name as a
   * Name external id, and every era any contributing roster was seen under
   * -- each era resolved server-side, by external id, against whatever
   * TpErasImportService upserted moments earlier in the same run (one batched
   * lookup for the whole run, not one per roster). Returns
   * `raceIdsByTeamRaceCode` keyed by CODE (not name), so a roster's
   * `teamRaceCode` resolves directly to the unified race DB id for the
   * downstream positions/teams import. `rosters` is the already-collected
   * roster list (via `RosterCollectionService`, run once for all three
   * imports); this service only groups and upserts. Idempotent.
   */
  async importRaces(rosters: RosterEntry[]): Promise<{
    result: ImportResult;
    raceIdsByTeamRaceCode: Map<string, number>;
    raceNamesById: Map<number, string>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const raceIdsByTeamRaceCode = new Map<string, number>();
    const raceNamesById = new Map<number, string>();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        raceIdsByTeamRaceCode,
        raceNamesById,
      };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    let eraNames: string[];
    try {
      eraNames = [
        ...new Set(this.eraDataConfig.getEras().map((era) => era.name)),
      ];
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { externalSystems: [tpSystemName] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
        raceIdsByTeamRaceCode,
        raceNamesById,
      };
    }
    const eraIds = await this.lookup.lookupMap(
      'era',
      eraNames.map((name) => ({
        externalSystemId: tpSystemId,
        externalId: name,
      })),
    );

    const groups = new Map<string, RaceGroup>();
    for (const { roster, era } of rosters) {
      let group = groups.get(roster.raceName);
      if (!group) {
        group = {
          raceName: roster.raceName,
          codes: new Set(),
          eraIds: new Set(),
        };
        groups.set(roster.raceName, group);
      }
      group.codes.add(roster.teamRaceCode);
      const eraId = eraIds.get(
        this.lookup.keyOf({ externalSystemId: tpSystemId, externalId: era }),
      );
      if (eraId === undefined) {
        errors.push(this.rosterCollection.unknownEraError(era, roster));
      } else {
        group.eraIds.add(eraId);
      }
    }

    for (const group of groups.values()) {
      const data: UpsertRace = {
        name: group.raceName,
        eras: [...group.eraIds],
        externalIds: [
          ...[...group.codes].map((code) => ({
            externalSystemId: tpSystemId,
            externalId: code,
          })),
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forRace(group.raceName),
          },
        ],
      };
      const upserted = await this.racesImport.upsertRace(data, errors);
      if (upserted) {
        imported += 1;
        raceNamesById.set(upserted.id, group.raceName);
        for (const code of group.codes) {
          raceIdsByTeamRaceCode.set(code, upserted.id);
        }
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      raceIdsByTeamRaceCode,
      raceNamesById,
    };
  }
}
