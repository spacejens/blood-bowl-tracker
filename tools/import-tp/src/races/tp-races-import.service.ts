import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  makeImportResult,
  RacesImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import type { RosterEntry } from '../source/roster-collection.service';
import { unknownEraError } from '../source/roster-collection.service';

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
  ) {}

  /**
   * Import every race that appears on a TP roster file. Rosters are grouped by
   * `rosterMaster.name` (the display name), NOT by `teamRace` code, because one
   * logical race can carry several rule-set-variant codes. Each group upserts
   * once, carrying every distinct code as a TP external id (all in one call, so
   * the merge semantics collapse them onto a single row), the display name as a
   * Name external id, and every era any contributing roster was seen under.
   * Returns `raceIdsByTeamRaceCode` keyed by CODE (not name), so a roster's
   * `teamRaceCode` resolves directly to the unified race DB id for the
   * downstream positions/teams import. `rosters` is the already-collected
   * roster list (via `RosterCollectionService`, run once for all three
   * imports); this service only groups and upserts. Idempotent.
   */
  async importRaces(
    rosters: RosterEntry[],
    eraIdsByName: Map<string, number>,
  ): Promise<{
    result: ImportResult;
    raceIdsByTeamRaceCode: Map<string, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const raceIdsByTeamRaceCode = new Map<string, number>();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      tpSystemName,
      NAME_EXTERNAL_SYSTEM_NAME,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: makeImportResult({ imported, errors }),
        raceIdsByTeamRaceCode,
      };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

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
      const eraId = eraIdsByName.get(era);
      if (eraId === undefined) {
        errors.push(unknownEraError(era, roster));
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
          { externalSystemId: nameSystemId, externalId: group.raceName },
        ],
      };
      const upserted = await this.racesImport.upsertRace(data, errors);
      if (upserted) {
        imported += 1;
        for (const code of group.codes) {
          raceIdsByTeamRaceCode.set(code, upserted.id);
        }
      }
    }

    return {
      result: makeImportResult({ imported, errors }),
      raceIdsByTeamRaceCode,
    };
  }
}
