import type { UpsertPosition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  PositionsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import type { TpPositionCharacteristics } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import { TpEraRulesSetResolverService } from '../eras/tp-era-rules-set-resolver.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { OfficialTeamsEntry } from '../source/official-teams-collection.service';

/**
 * One position, keyed by (raceId, name), accumulated across the rules sets
 * whose official list carries it. Regular and star positions share this
 * shape: the official list publishes both with characteristics, so
 * `isStarPlayer` is the only difference and one path handles both.
 */
interface PositionGroup {
  raceId: number;
  name: string;
  isStarPlayer: boolean;
  tpPositionIds: Set<number>;
  eraIds: Set<number>;
  /** Rules set DB id -> the official list's canonical characteristics. */
  characteristics: Map<number, TpPositionCharacteristics>;
}

interface ImportPositionsOptions {
  raceNamesById: Map<number, string>;
}

@Injectable()
export class TpPositionsImportService {
  constructor(
    private readonly positionsImport: PositionsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
    private readonly eraDataConfig: EraDataConfigService,
    private readonly lookup: ReferenceLookupService,
    private readonly eraRulesSetResolver: TpEraRulesSetResolverService,
  ) {}

  /**
   * Import every position on TP's official team list, regular and star alike.
   * Positions are grouped by `(unified raceId, position name)` so that
   * identically-named positions across one logical race's rules-set variants
   * collapse to a single row collecting every TP position id.
   *
   * A regular position's `Name` external id is scoped as
   * `` `${raceName}: ${positionName}` `` because position names are not
   * globally unique; a star's is its bare name, which is what dedupes it onto
   * the same row as the inducement-hire path and the BBL importer's stars. A
   * star external id colliding with a regular position's is caught
   * server-side by `PositionsService`'s `detectSemanticConflict` hook, so no
   * client-side guard is needed here.
   *
   * Star positions get `syncRaceEras` too: the official list says which race
   * may field which star under which rules set, so their availability is a
   * direct fact here rather than something derived from observed hires.
   *
   * Characteristics need no accumulation or conflict resolution: the official
   * list carries exactly one canonical value per (position, rules set).
   */
  async importPositions(
    officialTeams: OfficialTeamsEntry[],
    options: ImportPositionsOptions,
  ): Promise<{
    result: ImportResult;
    characteristicsByPositionId: Map<
      number,
      Map<number, TpPositionCharacteristics>
    >;
  }> {
    const { raceNamesById } = options;
    let imported = 0;
    const errors: ImportError[] = [];
    const characteristicsByPositionId = new Map<
      number,
      Map<number, TpPositionCharacteristics>
    >();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        characteristicsByPositionId,
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
        characteristicsByPositionId,
      };
    }

    const eraIds = await this.lookup.lookupMap(
      'era',
      [...new Set(eras.map((era) => era.name))].map((name) => ({
        externalSystemId: tpSystemId,
        externalId: name,
      })),
    );
    const rulesSetIdByEraName =
      await this.eraRulesSetResolver.resolveRulesSetIdByEraName({
        eras,
        tpSystemId,
        errors,
      });
    const raceIds = await this.lookup.lookupMap(
      'race',
      [...new Set(officialTeams.map(({ race }) => race.teamRaceCode))].map(
        (code) => ({ externalSystemId: tpSystemId, externalId: code }),
      ),
    );

    const groups = new Map<string, PositionGroup>();
    for (const { race, rulesSet } of officialTeams) {
      const raceId = raceIds.get(
        this.lookup.keyOf({
          externalSystemId: tpSystemId,
          externalId: race.teamRaceCode,
        }),
      );
      if (raceId === undefined) {
        errors.push(
          this.importResults.error({
            item: { rulesSet, teamRaceCode: race.teamRaceCode },
            message:
              `Skipping positions for "${race.teamRaceCode}" (${rulesSet}): ` +
              'could not resolve its race.',
          }),
        );
        continue;
      }
      const matchingEras = eras.filter((era) =>
        era.rulesSets.some(
          (name) => name.toLowerCase() === rulesSet.toLowerCase(),
        ),
      );
      for (const position of race.positions) {
        const group = this.groupFor({ groups, raceId, position });
        if (position.tpPositionId !== undefined) {
          group.tpPositionIds.add(position.tpPositionId);
        }
        for (const era of matchingEras) {
          const eraId = eraIds.get(
            this.lookup.keyOf({
              externalSystemId: tpSystemId,
              externalId: era.name,
            }),
          );
          if (eraId !== undefined) {
            group.eraIds.add(eraId);
          }
          const rulesSetId = rulesSetIdByEraName.get(era.name);
          if (rulesSetId !== undefined) {
            group.characteristics.set(rulesSetId, position.characteristics);
          }
        }
      }
    }

    for (const group of groups.values()) {
      const data: UpsertPosition = {
        name: group.name,
        isStarPlayer: group.isStarPlayer,
        externalIds: this.externalIdsFor({
          group,
          systemIds: { tpSystemId, nameSystemId },
          raceNamesById,
          errors,
        }),
      };
      const upserted = await this.positionsImport.upsert(data, errors);
      if (!upserted) {
        continue;
      }
      imported += 1;
      this.recordCharacteristics({
        characteristicsByPositionId,
        positionId: upserted.id,
        group,
      });
      await this.positionsImport.syncRaceEras(
        {
          positionId: upserted.id,
          raceEras: [...group.eraIds].map((eraId) => ({
            raceId: group.raceId,
            eraId,
          })),
        },
        errors,
      );
    }

    return {
      result: this.importResults.result({ imported, errors }),
      characteristicsByPositionId,
    };
  }

  /** The group for one (raceId, position name), created on first use. */
  private groupFor(options: {
    groups: Map<string, PositionGroup>;
    raceId: number;
    position: { name: string; isStarPlayer: boolean };
  }): PositionGroup {
    const { groups, raceId, position } = options;
    const key = `${raceId} ${position.name}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        raceId,
        name: position.name,
        isStarPlayer: position.isStarPlayer,
        tpPositionIds: new Set(),
        eraIds: new Set(),
        characteristics: new Map(),
      };
      groups.set(key, group);
    }
    return group;
  }

  /**
   * A group's external ids: one TP id per official-list position id (what
   * keeps a roster-embedded player resolvable, since TpPlayersImportService
   * looks a position up by `String(lineUpMasterId)`), plus a Name id --
   * bare for a star, race-scoped for a regular position. A race whose name is
   * missing from `raceNamesById` records one error and contributes no Name id
   * rather than skipping the position.
   */
  private externalIdsFor(options: {
    group: PositionGroup;
    systemIds: { tpSystemId: number; nameSystemId: number };
    raceNamesById: Map<number, string>;
    errors: ImportError[];
  }): { externalSystemId: number; externalId: string }[] {
    const { group, systemIds, raceNamesById, errors } = options;
    const { tpSystemId, nameSystemId } = systemIds;
    const externalIds = [...group.tpPositionIds].map((tpPositionId) => ({
      externalSystemId: tpSystemId,
      externalId: String(tpPositionId),
    }));
    if (group.isStarPlayer) {
      externalIds.push(
        { externalSystemId: tpSystemId, externalId: group.name },
        {
          externalSystemId: nameSystemId,
          externalId: this.nameExternalId.forStarPosition(group.name),
        },
      );
      return externalIds;
    }
    const raceName = raceNamesById.get(group.raceId);
    if (raceName === undefined) {
      errors.push(
        this.importResults.error({
          item: { raceId: group.raceId, position: group.name },
          message:
            `Could not resolve a race name for race id ${group.raceId} ` +
            `(position "${group.name}"): missing from raceNamesById; ` +
            'skipping its Name external id',
        }),
      );
      return externalIds;
    }
    externalIds.push({
      externalSystemId: nameSystemId,
      externalId: this.nameExternalId.forPosition(raceName, group.name),
    });
    return externalIds;
  }

  /**
   * Merge one group's per-rules-set characteristics into the map keyed by the
   * DB position id its upsert resolved to. Two groups can share one row -- a
   * star available to several races produces one `PositionGroup` per race
   * (the group key includes `raceId`), each upserting to the SAME row -- so
   * each contributes its own rules sets with no conflict handling, because
   * the official list carries exactly one canonical value per (position,
   * rules set).
   */
  private recordCharacteristics(options: {
    characteristicsByPositionId: Map<
      number,
      Map<number, TpPositionCharacteristics>
    >;
    positionId: number;
    group: PositionGroup;
  }): void {
    const { characteristicsByPositionId, positionId, group } = options;
    if (group.characteristics.size === 0) {
      return;
    }
    let existing = characteristicsByPositionId.get(positionId);
    if (existing === undefined) {
      existing = new Map();
      characteristicsByPositionId.set(positionId, existing);
    }
    for (const [rulesSetId, characteristics] of group.characteristics) {
      existing.set(rulesSetId, characteristics);
    }
  }
}
