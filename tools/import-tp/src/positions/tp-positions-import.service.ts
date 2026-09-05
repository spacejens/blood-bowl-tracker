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
  /**
   * Rules sets whose stored characteristics came from an authoritative
   * roster (one whose TP team-race code carries the era's rules-set-name
   * suffix). Bookkeeping local to conflict resolution — never returned to
   * callers, which only ever see `characteristics`.
   */
  authoritativeRulesSetIds: Set<number>;
  /** Rules sets whose observations disagreed unresolvably; permanently dropped. */
  conflictingRulesSetIds: Set<number>;
}

/** One star position, keyed by name only (star players are not race-scoped),
 * accumulated across roster files. */
interface StarPositionGroup {
  name: string;
  tpPositionIds: Set<number>;
  characteristics: Map<number, TpPositionCharacteristics>;
  authoritativeRulesSetIds: Set<number>;
  conflictingRulesSetIds: Set<number>;
}

/**
 * Characteristics accumulated for one *resolved* DB position id, merged across
 * every group whose upsert landed on that row. Two groups can share one row:
 * TP renames a roster slot across rules-set generations (`Halfling Hopeful
 * Lineman` -> `Halfling Hopeful`) while `tools/import-manual` registers both
 * literal names as external ids of a single Position, so grouping by
 * `${raceId} ${name}` yields two groups whose upserts resolve identically.
 * Shaped to match what `accumulateCharacteristics` expects as its `group`, so
 * the same conflict rules apply within a group and across groups.
 */
interface PositionCharacteristicsAccumulator {
  /** The first contributing group's position name, used in error messages. */
  name: string;
  characteristics: Map<number, TpPositionCharacteristics>;
  authoritativeRulesSetIds: Set<number>;
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
   * same (position, rules set) is resolved in favour of whichever roster's
   * TP team-race code carries the era's rules-set-name suffix (TP's own way
   * of superseding a race's roster mid-rules-set); when both or neither
   * qualify, the disagreement is unresolvable bad TP source data and the
   * rules set is dropped for that position with one recorded error.
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
    const accumulators = new Map<number, PositionCharacteristicsAccumulator>();

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

    const rulesSetNameByEraName = this.buildRulesSetNameByEraName(eras);

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
      const authoritative = this.isAuthoritativeRoster(
        roster.teamRaceCode,
        rulesSetNameByEraName.get(era),
      );
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
            authoritativeRulesSetIds: new Set(),
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
            authoritative,
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
      this.mergeGroupCharacteristics({
        accumulators,
        positionId: upserted.id,
        group,
        errors,
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
      const authoritative = this.isAuthoritativeRoster(
        roster.teamRaceCode,
        rulesSetNameByEraName.get(era),
      );
      for (const starPosition of roster.starPositions) {
        let group = starGroups.get(starPosition.name);
        if (!group) {
          group = {
            name: starPosition.name,
            tpPositionIds: new Set(),
            characteristics: new Map(),
            authoritativeRulesSetIds: new Set(),
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
            authoritative,
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
      this.mergeGroupCharacteristics({
        accumulators,
        positionId: upserted.id,
        group,
        errors,
      });
    }

    for (const [positionId, accumulator] of accumulators) {
      if (accumulator.characteristics.size > 0) {
        characteristicsByPositionId.set(
          positionId,
          accumulator.characteristics,
        );
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      starPositionIds,
      characteristicsByPositionId,
    };
  }

  /**
   * Era name -> the single rules set name that era declares in
   * import-tp-config.json5. Eras declaring zero or several rules sets are
   * omitted, mirroring the gate TpEraRulesSetResolverService already applies:
   * such an era never resolves a rules-set *id* either, so its rosters never
   * reach accumulateCharacteristics in the first place.
   */
  private buildRulesSetNameByEraName(
    eras: EraDataConfig[],
  ): Map<string, string> {
    const byEraName = new Map<string, string>();
    for (const era of eras) {
      if (era.rulesSets.length === 1) {
        byEraName.set(era.name, era.rulesSets[0]);
      }
    }
    return byEraName;
  }

  /**
   * Whether a roster's own TP team-race code marks it as the current template
   * for its era's rules set. When TP updates a race's roster mid-rules-set it
   * keeps the legacy roster under the bare race code and publishes the new one
   * under a code suffixed with the rules set name (e.g. `Vampire_BB2020`
   * superseding `Vampire` within BB2020), so the suffixed roster is the
   * authoritative, post-update template. A heuristic on TP's naming
   * convention, applied only to break a disagreement — never to change what a
   * single, unopposed observation records. `false` when the era declares no
   * single rules set name.
   */
  private isAuthoritativeRoster(
    teamRaceCode: string,
    rulesSetName: string | undefined,
  ): boolean {
    return (
      rulesSetName !== undefined && teamRaceCode.endsWith(`_${rulesSetName}`)
    );
  }

  /**
   * Fold one group's per-rules-set characteristics into the accumulator for
   * the DB position id its upsert resolved to, creating that accumulator on
   * first use. Merging rather than replacing is what lets two groups sharing
   * one resolved position id each keep their own rules sets, using the same
   * `accumulateCharacteristics` conflict rules a single group already applies
   * — authoritative-roster-wins, agreement is a no-op — including whether the
   * value being contributed came from an authoritative roster. One difference
   * from within-group accumulation: a group's own `conflictingRulesSetIds` are
   * not carried into the accumulator, so a rules set one group dropped as
   * internally ambiguous can still be filled from another group's clean
   * observation, rather than being permanently poisoned across groups. With
   * one group per position id — the common case — this is equivalent to
   * storing the group's map directly.
   */
  private mergeGroupCharacteristics(options: {
    accumulators: Map<number, PositionCharacteristicsAccumulator>;
    positionId: number;
    group: {
      name: string;
      characteristics: Map<number, TpPositionCharacteristics>;
      authoritativeRulesSetIds: Set<number>;
    };
    errors: ImportError[];
  }): void {
    const { accumulators, positionId, group, errors } = options;
    let accumulator = accumulators.get(positionId);
    if (accumulator === undefined) {
      accumulator = {
        name: group.name,
        characteristics: new Map(),
        authoritativeRulesSetIds: new Set(),
        conflictingRulesSetIds: new Set(),
      };
      accumulators.set(positionId, accumulator);
    }
    for (const [rulesSetId, characteristics] of group.characteristics) {
      this.accumulateCharacteristics({
        group: accumulator,
        rulesSetId,
        characteristics,
        authoritative: group.authoritativeRulesSetIds.has(rulesSetId),
        errors,
        positionId,
      });
    }
  }

  /**
   * Record one roster's observation of a position's characteristics under one
   * rules set. Two rosters disagreeing is resolved by TP's own suffix convention when it
   * can be: an authoritative observation (see `isAuthoritativeRoster`) beats a
   * non-authoritative one, silently — that is TP correctly describing a
   * mid-rules-set roster update, not bad data, and this importer's only
   * reporting channel (`errors`) would flip `ImportResult.success` to false if
   * used for it. A disagreement where both or neither observation is
   * authoritative is genuinely ambiguous and keeps the original behaviour:
   * the rules set is dropped for this position (once, with one error) and is
   * never resurrected by a later observation, while every other rules set for
   * the same position is unaffected.
   *
   * `positionId` is supplied only when accumulating across groups sharing a
   * resolved DB position id (via `mergeGroupCharacteristics`): the group's own
   * `name` alone would otherwise identify a cross-group conflict by whichever
   * literal roster-slot name first created the accumulator, hiding the other
   * contributing name from the error.
   */
  private accumulateCharacteristics(options: {
    group: {
      name: string;
      characteristics: Map<number, TpPositionCharacteristics>;
      authoritativeRulesSetIds: Set<number>;
      conflictingRulesSetIds: Set<number>;
    };
    rulesSetId: number;
    characteristics: TpPositionCharacteristics;
    authoritative: boolean;
    errors: ImportError[];
    positionId?: number;
  }): void {
    const {
      group,
      rulesSetId,
      characteristics,
      authoritative,
      errors,
      positionId,
    } = options;
    if (group.conflictingRulesSetIds.has(rulesSetId)) {
      return;
    }
    const existing = group.characteristics.get(rulesSetId);
    if (existing === undefined) {
      this.storeCharacteristics({
        group,
        rulesSetId,
        characteristics,
        authoritative,
      });
      return;
    }
    if (
      existing.move === characteristics.move &&
      existing.strength === characteristics.strength &&
      existing.agility === characteristics.agility &&
      existing.passing === characteristics.passing &&
      existing.armour === characteristics.armour
    ) {
      // Agreement, so nothing to store -- but an authoritative roster
      // confirming the stored values still promotes them, so a later
      // non-authoritative disagreement loses instead of being treated as
      // ambiguous.
      if (authoritative) {
        group.authoritativeRulesSetIds.add(rulesSetId);
      }
      return;
    }
    const existingIsAuthoritative =
      group.authoritativeRulesSetIds.has(rulesSetId);
    if (authoritative && !existingIsAuthoritative) {
      this.storeCharacteristics({
        group,
        rulesSetId,
        characteristics,
        authoritative,
      });
      return;
    }
    if (!authoritative && existingIsAuthoritative) {
      return;
    }
    group.conflictingRulesSetIds.add(rulesSetId);
    group.characteristics.delete(rulesSetId);
    group.authoritativeRulesSetIds.delete(rulesSetId);
    errors.push(
      this.importResults.error({
        item: {
          position: group.name,
          ...(positionId === undefined ? {} : { positionId }),
          rulesSetId,
          existing,
          characteristics,
        },
        message:
          `Conflicting characteristics for position "${group.name}"` +
          (positionId === undefined ? '' : ` (position id ${positionId})`) +
          ` under rules set id ${rulesSetId}: ` +
          `${this.formatCharacteristics(existing)} vs ` +
          `${this.formatCharacteristics(characteristics)}; skipping this ` +
          'rules set for this position.',
      }),
    );
  }

  /** Store one observation as a group's characteristics for a rules set, and
   * record whether it came from an authoritative roster. */
  private storeCharacteristics(options: {
    group: {
      characteristics: Map<number, TpPositionCharacteristics>;
      authoritativeRulesSetIds: Set<number>;
    };
    rulesSetId: number;
    characteristics: TpPositionCharacteristics;
    authoritative: boolean;
  }): void {
    const { group, rulesSetId, characteristics, authoritative } = options;
    group.characteristics.set(rulesSetId, characteristics);
    if (authoritative) {
      group.authoritativeRulesSetIds.add(rulesSetId);
    } else {
      group.authoritativeRulesSetIds.delete(rulesSetId);
    }
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
