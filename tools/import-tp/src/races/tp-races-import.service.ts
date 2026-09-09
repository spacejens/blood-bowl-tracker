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

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { OfficialTeamsEntry } from '../source/official-teams-collection.service';

/** One logical race, accumulated across every official list that names it. */
interface RaceGroup {
  raceName: string;
  codes: Set<string>;
  rulesSets: Set<string>;
}

@Injectable()
export class TpRacesImportService {
  constructor(
    private readonly racesImport: RacesImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
    private readonly eraDataConfig: EraDataConfigService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Import every race on TP's official team list. Entries are grouped by the
   * official list's display name, NOT by `teamRace` code, because one logical
   * race carries a different code per rules-set variant. Each group upserts
   * once, carrying every distinct code as a TP external id (all in one call,
   * so the merge semantics collapse them onto a single row) and the display
   * name as a Name external id.
   *
   * A race's eras are the union of every configured era declaring any rules
   * set this race appears on -- a direct fact about the official list, not an
   * inference from which rosters happened to use the race in which era. Each
   * era id is resolved server-side, by external id, against whatever
   * TpErasImportService upserted moments earlier in the same run (one batched
   * lookup for the whole run).
   *
   * Returns `raceNamesById` (DB race id -> display name), used by the
   * downstream positions import to build a Name external id; downstream
   * consumers otherwise resolve a race server-side by its `teamRaceCode`.
   * Idempotent.
   */
  async importRaces(officialTeams: OfficialTeamsEntry[]): Promise<{
    result: ImportResult;
    raceNamesById: Map<number, string>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
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
        raceNamesById,
      };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    let eras: EraDataConfig[];
    try {
      eras = this.eraDataConfig.getEras();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { externalSystems: [tpSystemName] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
        raceNamesById,
      };
    }
    const eraIds = await this.lookup.lookupMap(
      'era',
      [...new Set(eras.map((era) => era.name))].map((name) => ({
        externalSystemId: tpSystemId,
        externalId: name,
      })),
    );

    const groups = new Map<string, RaceGroup>();
    for (const { race, rulesSet } of officialTeams) {
      let group = groups.get(race.name);
      if (!group) {
        group = { raceName: race.name, codes: new Set(), rulesSets: new Set() };
        groups.set(race.name, group);
      }
      group.codes.add(race.teamRaceCode);
      group.rulesSets.add(rulesSet);
    }

    for (const group of groups.values()) {
      const data: UpsertRace = {
        name: group.raceName,
        eras: this.eraIdsFor({
          group,
          eras,
          resolveEraId: (eraName) =>
            eraIds.get(
              this.lookup.keyOf({
                externalSystemId: tpSystemId,
                externalId: eraName,
              }),
            ),
          errors,
        }),
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
      const upserted = await this.racesImport.upsert(data, errors);
      if (upserted) {
        imported += 1;
        raceNamesById.set(upserted.id, group.raceName);
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      raceNamesById,
    };
  }

  /**
   * Every era declaring any of this race's rules sets, as DB era ids. A rules
   * set matching no configured era, or an era whose DB id cannot be resolved,
   * is recorded as a non-fatal error and contributes nothing -- the race is
   * still imported, just without that era.
   */
  private eraIdsFor(options: {
    group: RaceGroup;
    eras: EraDataConfig[];
    resolveEraId: (eraName: string) => number | undefined;
    errors: ImportError[];
  }): number[] {
    const { group, eras, resolveEraId, errors } = options;
    const ids = new Set<number>();
    for (const rulesSet of group.rulesSets) {
      const matching = eras.filter((era) =>
        era.rulesSets.some(
          (name) => name.toLowerCase() === rulesSet.toLowerCase(),
        ),
      );
      if (matching.length === 0) {
        errors.push(
          this.importResults.error({
            item: { race: group.raceName, rulesSet },
            message:
              `Rules set "${rulesSet}" (race "${group.raceName}") matches no ` +
              'configured era; the race is imported without it.',
          }),
        );
        continue;
      }
      for (const era of matching) {
        const eraId = resolveEraId(era.name);
        if (eraId === undefined) {
          errors.push(
            this.importResults.error({
              item: { race: group.raceName, era: era.name },
              message:
                `Could not resolve era "${era.name}" (race ` +
                `"${group.raceName}"); skipping it for this race.`,
            }),
          );
          continue;
        }
        ids.add(eraId);
      }
    }
    return [...ids];
  }
}
