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
import type { RosterEntry } from '../source/roster-collection.service';
import { RosterCollectionService } from '../source/roster-collection.service';

/** One position, keyed by (raceId, name), accumulated across roster files. */
interface PositionGroup {
  raceId: number;
  name: string;
  tpPositionIds: Set<number>;
  eraIds: Set<number>;
  /** Rules set DB id -> the characteristics every roster agreed on. */
  characteristics: Map<number, TpPositionCharacteristics>;
  /** Rules sets whose observations disagreed; permanently dropped. */
  conflictingRulesSetIds: Set<number>;
}

/** One star position, keyed by name only (star players are not race-scoped),
 * accumulated across roster files. */
interface StarPositionGroup {
  name: string;
  tpPositionIds: Set<number>;
  characteristics: Map<number, TpPositionCharacteristics>;
  conflictingRulesSetIds: Set<number>;
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
    private readonly rosterCollection: RosterCollectionService,
    private readonly importResults: ImportResultService,
    private readonly eraDataConfig: EraDataConfigService,
    private readonly lookup: ReferenceLookupService,
    private readonly eraRulesSetResolver: TpEraRulesSetResolverService,
  ) {}

  /**
   * Positions are grouped by `(unified raceId, position name)` so that
   * identically-named positions across one logical race's rule-set variants
   * collapse to a single row collecting every `tpPositionId`. A regular
   * position's `Name` external id is scoped as `` `${raceName}: ${positionName}` ``
   * because position names are not globally unique.
   *
   * Star positions are grouped by name alone and take a bare-name `Name`
   * external id, which is what dedupes them onto the same row as the
   * inducement-hire path and the BBL importer's stars.
   *
   * A star external id colliding with a regular position's is caught
   * server-side: `PositionsService` passes `upsertByExternalIds` a
   * `detectSemanticConflict` hook that throws on an `isStarPlayer` mismatch
   * instead of overwriting the row, so no client-side guard is needed here.
   *
   * Alongside grouping, each group also accumulates the characteristics its
   * rosters report, keyed by rules-set DB id (resolved from each roster's era
   * via `EraDataConfigService.getEras()`). Two rosters disagreeing about the
   * same (position, rules set) is treated as bad TP source data: the rules
   * set is dropped for that position and one error is recorded, rather than
   * letting either roster's observation silently win.
   */
  async importPositions(
    rosters: RosterEntry[],
    options: ImportPositionsOptions,
  ): Promise<{
    result: ImportResult;
    starPositionIds: Set<number>;
    characteristicsByPositionId: Map<
      number,
      Map<number, TpPositionCharacteristics>
    >;
  }> {
    const { raceNamesById } = options;
    let imported = 0;
    const errors: ImportError[] = [];
    const starPositionIds = new Set<number>();
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
        starPositionIds,
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
        starPositionIds,
        characteristicsByPositionId,
      };
    }
    const eraNames = [...new Set(eras.map((era) => era.name))];
    const eraIds = await this.lookup.lookupMap(
      'era',
      eraNames.map((name) => ({
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
      [...new Set(rosters.map(({ roster }) => roster.teamRaceCode))].map(
        (code) => ({ externalSystemId: tpSystemId, externalId: code }),
      ),
    );

    const groups = new Map<string, PositionGroup>();
    for (const { roster, era } of rosters) {
      const raceId = raceIds.get(
        this.lookup.keyOf({
          externalSystemId: tpSystemId,
          externalId: roster.teamRaceCode,
        }),
      );
      if (raceId === undefined) {
        errors.push(
          this.importResults.error({
            item: { roster: roster.id, teamRaceCode: roster.teamRaceCode },
            message: `Skipping positions for roster ${roster.id}: could not resolve race for code "${roster.teamRaceCode}"`,
          }),
        );
        continue;
      }
      const eraId = eraIds.get(
        this.lookup.keyOf({ externalSystemId: tpSystemId, externalId: era }),
      );
      if (eraId === undefined) {
        errors.push(this.rosterCollection.unknownEraError(era, roster));
      }
      const rulesSetId = rulesSetIdByEraName.get(era);
      for (const position of roster.positions) {
        const key = `${raceId} ${position.name}`;
        let group = groups.get(key);
        if (!group) {
          group = {
            raceId,
            name: position.name,
            tpPositionIds: new Set(),
            eraIds: new Set(),
            characteristics: new Map(),
            conflictingRulesSetIds: new Set(),
          };
          groups.set(key, group);
        }
        group.tpPositionIds.add(position.tpPositionId);
        if (eraId !== undefined) {
          group.eraIds.add(eraId);
        }
        if (rulesSetId !== undefined) {
          this.accumulateCharacteristics({
            group,
            rulesSetId,
            characteristics: position.characteristics,
            errors,
          });
        }
      }
    }

    for (const group of groups.values()) {
      const externalIds = [...group.tpPositionIds].map((tpPositionId) => ({
        externalSystemId: tpSystemId,
        externalId: String(tpPositionId),
      }));
      const raceName = raceNamesById.get(group.raceId);
      if (raceName === undefined) {
        errors.push(
          this.importResults.error({
            item: { raceId: group.raceId, position: group.name },
            message: `Could not resolve a race name for race id ${group.raceId} (position "${group.name}"): missing from raceNamesById; skipping its Name external id`,
          }),
        );
      } else {
        externalIds.push({
          externalSystemId: nameSystemId,
          externalId: this.nameExternalId.forPosition(raceName, group.name),
        });
      }
      const data: UpsertPosition = {
        name: group.name,
        isStarPlayer: false,
        externalIds,
      };
      const upserted = await this.positionsImport.upsert(data, errors);
      if (!upserted) {
        continue;
      }
      imported += 1;
      if (group.characteristics.size > 0) {
        characteristicsByPositionId.set(upserted.id, group.characteristics);
      }
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

    // Star positions: grouped by name only (not race — the same named star
    // player is the same entity regardless of team/race), upserted with a
    // TP-system bare-name external id (preserving TP's own catalog-independent
    // star id), one TP-system external id per distinct numeric tpPositionId
    // seen for that star, and a Name-system bare-name id so they dedupe onto
    // the SAME Position row the inducement-hire path and the BBL importer
    // create. The numeric ids are what makes a roster-embedded star
    // resolvable: TpPlayersImportService looks a position up by
    // String(lineUpMasterId), which is exactly this number, so without them
    // every roster-embedded star is skipped. A numeric id colliding
    // with a regular position's TP id is caught server-side by
    // PositionsService's detectSemanticConflict hook (isStarPlayer mismatch →
    // PositionUpsertConflictError, reported as a CONFLICT), never silently
    // overwritten. No syncRaceEras (not race-scoped).
    const starGroups = new Map<string, StarPositionGroup>();
    for (const { roster, era } of rosters) {
      const rulesSetId = rulesSetIdByEraName.get(era);
      for (const starPosition of roster.starPositions) {
        let group = starGroups.get(starPosition.name);
        if (!group) {
          group = {
            name: starPosition.name,
            tpPositionIds: new Set(),
            characteristics: new Map(),
            conflictingRulesSetIds: new Set(),
          };
          starGroups.set(starPosition.name, group);
        }
        group.tpPositionIds.add(starPosition.tpPositionId);
        if (rulesSetId !== undefined) {
          this.accumulateCharacteristics({
            group,
            rulesSetId,
            characteristics: starPosition.characteristics,
            errors,
          });
        }
      }
    }

    for (const group of starGroups.values()) {
      const data: UpsertPosition = {
        name: group.name,
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: tpSystemId, externalId: group.name },
          ...[...group.tpPositionIds].map((tpPositionId) => ({
            externalSystemId: tpSystemId,
            externalId: String(tpPositionId),
          })),
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forStarPosition(group.name),
          },
        ],
      };
      const upserted = await this.positionsImport.upsert(data, errors);
      if (!upserted) {
        continue;
      }
      imported += 1;
      starPositionIds.add(upserted.id);
      if (group.characteristics.size > 0) {
        characteristicsByPositionId.set(upserted.id, group.characteristics);
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      starPositionIds,
      characteristicsByPositionId,
    };
  }

  /**
   * Record one roster's observation of a position's characteristics under one
   * rules set. Two rosters disagreeing is bad TP data, not something to pick a
   * winner for: the rules set is dropped for this position (once, with one
   * error), while every other rules set for the same position is unaffected.
   */
  private accumulateCharacteristics(options: {
    group: {
      name: string;
      characteristics: Map<number, TpPositionCharacteristics>;
      conflictingRulesSetIds: Set<number>;
    };
    rulesSetId: number;
    characteristics: TpPositionCharacteristics;
    errors: ImportError[];
  }): void {
    const { group, rulesSetId, characteristics, errors } = options;
    if (group.conflictingRulesSetIds.has(rulesSetId)) {
      return;
    }
    const existing = group.characteristics.get(rulesSetId);
    if (existing === undefined) {
      group.characteristics.set(rulesSetId, characteristics);
      return;
    }
    if (
      existing.move === characteristics.move &&
      existing.strength === characteristics.strength &&
      existing.agility === characteristics.agility &&
      existing.passing === characteristics.passing &&
      existing.armour === characteristics.armour
    ) {
      return;
    }
    group.conflictingRulesSetIds.add(rulesSetId);
    group.characteristics.delete(rulesSetId);
    errors.push(
      this.importResults.error({
        item: { position: group.name, rulesSetId, existing, characteristics },
        message:
          `Conflicting characteristics for position "${group.name}" under ` +
          `rules set id ${rulesSetId}: ` +
          `${this.formatCharacteristics(existing)} vs ` +
          `${this.formatCharacteristics(characteristics)}; skipping this ` +
          'rules set for this position.',
      }),
    );
  }

  /** One characteristics set as a compact "MA 6 ST 3 AG 3 PA 4 AV 9" line. */
  private formatCharacteristics(
    characteristics: TpPositionCharacteristics,
  ): string {
    return (
      `MA ${characteristics.move} ST ${characteristics.strength} ` +
      `AG ${characteristics.agility} PA ${characteristics.passing} ` +
      `AV ${characteristics.armour}`
    );
  }
}
