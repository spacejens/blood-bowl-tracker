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
import { Injectable } from '@nestjs/common';

import { EraDataConfigService } from '../eras/era-data-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { RosterCollectionService } from '../source/roster-collection.service';

/** One position, keyed by (raceId, name), accumulated across roster files. */
interface PositionGroup {
  raceId: number;
  name: string;
  tpPositionIds: Set<number>;
  eraIds: Set<number>;
}

/** One star position, keyed by name only (star players are not race-scoped),
 * accumulated across roster files. */
interface StarPositionGroup {
  name: string;
  tpPositionIds: Set<number>;
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
  ) {}

  /**
   * Import every position on the TP roster files. Positions are grouped by
   * `(unified raceId, position name)`: identically-named positions across the
   * rule-set-variant codes of one logical race collapse to one row, collecting
   * every distinct `tpPositionId` as a TP external id (all in one upsert call).
   * Regular positions also carry a `Name` external id in
   * `` `${raceName}: ${positionName}` `` format, resolved via `raceNamesById`
   * (position names are not globally unique, so they are scoped by race name);
   * if a group's raceId is missing from `raceNamesById` this is recorded as a
   * non-fatal error and the position falls back to its TP-only external ids.
   * Both the TP and Name external systems are bootstrapped up front. After each
   * upsert, the observed `{ raceId, eraId }` availability is recorded via
   * syncRaceEras. A roster whose race cannot be resolved is recorded as an
   * error and its positions skipped. Regular positions import with
   * `isStarPlayer: false`. Star positions (from `roster.starPositions`) are
   * grouped by name only, upserted with `isStarPlayer: true` and BOTH a
   * TP-system bare-name external id (`group.name`, preserving TP's own
   * catalog-independent star id) AND a Name-system bare-name external id
   * (deduping onto the same row the inducement-hire path and the BBL
   * importer's star positions use). A star external id colliding with an
   * already-upserted regular position's external id is now caught
   * server-side by the position upsert itself (which finds the same external
   * id and either updates that row or reports a CONFLICT), so no client-side
   * collision guard is needed here any more.
   * `rosters` is the already-collected roster list (via
   * `RosterCollectionService`, run once for all three imports); this service
   * only groups and upserts. Idempotent.
   */
  async importPositions(
    rosters: RosterEntry[],
    options: ImportPositionsOptions,
  ): Promise<{
    result: ImportResult;
    starPositionIds: Set<number>;
  }> {
    const { raceNamesById } = options;
    let imported = 0;
    const errors: ImportError[] = [];
    const starPositionIds = new Set<number>();

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
        starPositionIds,
      };
    }
    const eraIds = await this.lookup.lookupMap(
      'era',
      eraNames.map((name) => ({
        externalSystemId: tpSystemId,
        externalId: name,
      })),
    );

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
      for (const position of roster.positions) {
        const key = `${raceId} ${position.name}`;
        let group = groups.get(key);
        if (!group) {
          group = {
            raceId,
            name: position.name,
            tpPositionIds: new Set(),
            eraIds: new Set(),
          };
          groups.set(key, group);
        }
        group.tpPositionIds.add(position.tpPositionId);
        if (eraId !== undefined) {
          group.eraIds.add(eraId);
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
      const upserted = await this.positionsImport.upsertPosition(data, errors);
      if (!upserted) {
        continue;
      }
      imported += 1;
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
    // player is the same entity regardless of team/race), upserted with two
    // bare-name external ids: a TP-system one (preserving TP's own
    // catalog-independent star id) and a Name-system one so they dedupe onto
    // the SAME Position row the inducement-hire path (#198) and the BBL
    // importer create. No syncRaceEras (not race-scoped).
    const starGroups = new Map<string, StarPositionGroup>();
    for (const { roster } of rosters) {
      for (const starPosition of roster.starPositions) {
        let group = starGroups.get(starPosition.name);
        if (!group) {
          group = { name: starPosition.name, tpPositionIds: new Set() };
          starGroups.set(starPosition.name, group);
        }
        group.tpPositionIds.add(starPosition.tpPositionId);
      }
    }

    for (const group of starGroups.values()) {
      const data: UpsertPosition = {
        name: group.name,
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: tpSystemId, externalId: group.name },
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forStarPosition(group.name),
          },
        ],
      };
      const upserted = await this.positionsImport.upsertPosition(data, errors);
      if (!upserted) {
        continue;
      }
      imported += 1;
      starPositionIds.add(upserted.id);
    }

    return {
      result: this.importResults.result({ imported, errors }),
      starPositionIds,
    };
  }
}
