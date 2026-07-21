import type { UpsertPosition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  makeImportError,
  makeImportResult,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { unknownEraError } from '../source/roster-collection.service';

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

@Injectable()
export class TpPositionsImportService {
  constructor(
    private readonly positionsImport: PositionsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import every position on the TP roster files. Positions are grouped by
   * `(unified raceId, position name)`: identically-named positions across the
   * rule-set-variant codes of one logical race collapse to one row, collecting
   * every distinct `tpPositionId` as a TP external id (all in one upsert call).
   * Positions carry NO Name external id (position names are not race-unique), so
   * only the TP external system is bootstrapped. After each upsert, the observed
   * `{ raceId, eraId }` availability is recorded via syncRaceEras. A roster whose
   * race cannot be resolved is recorded as an error and its positions skipped.
   * Regular positions import with `isStarPlayer: false`. Star positions (from
   * `roster.starPositions`) are grouped by name only, upserted with
   * `isStarPlayer: true` and a bare-name external id (deduping onto the same row
   * the inducement-hire path uses), and merged into the same
   * `positionIdsByTpPositionId` map keyed by their TP catalog id; a catalog id
   * colliding with an already-mapped id is skipped with a non-fatal error.
   * `rosters` is the already-collected roster list (via
   * `RosterCollectionService`, run once for all three imports); this service
   * only groups and upserts. Idempotent.
   */
  async importPositions(
    rosters: RosterEntry[],
    raceIdsByTeamRaceCode: Map<string, number>,
    eraIdsByName: Map<string, number>,
  ): Promise<{
    result: ImportResult;
    positionIdsByTpPositionId: Map<number, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const positionIdsByTpPositionId = new Map<number, number>();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      tpSystemName,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: makeImportResult({ imported, errors }),
        positionIdsByTpPositionId,
      };
    }
    const [tpSystemId] = bootstrap.ids;

    const groups = new Map<string, PositionGroup>();
    for (const { roster, era } of rosters) {
      const raceId = raceIdsByTeamRaceCode.get(roster.teamRaceCode);
      if (raceId === undefined) {
        errors.push(
          makeImportError({
            item: { roster: roster.id, teamRaceCode: roster.teamRaceCode },
            message: `Skipping positions for roster ${roster.id}: could not resolve race for code "${roster.teamRaceCode}"`,
          }),
        );
        continue;
      }
      const eraId = eraIdsByName.get(era);
      if (eraId === undefined) {
        errors.push(unknownEraError(era, roster));
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
      const data: UpsertPosition = {
        name: group.name,
        isStarPlayer: false,
        externalIds: [...group.tpPositionIds].map((tpPositionId) => ({
          externalSystemId: tpSystemId,
          externalId: String(tpPositionId),
        })),
      };
      const upserted = await this.positionsImport.upsertPosition(data, errors);
      if (!upserted) {
        continue;
      }
      imported += 1;
      for (const tpPositionId of group.tpPositionIds) {
        positionIdsByTpPositionId.set(tpPositionId, upserted.id);
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
    // bare-name external id so they dedupe onto the SAME Position row the
    // inducement-hire path (#198) and the BBL importer create. No syncRaceEras
    // (not race-scoped). Ids merge into the same positionIdsByTpPositionId map,
    // keyed by the star catalog's own tpPositionId.
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
        externalIds: [{ externalSystemId: tpSystemId, externalId: group.name }],
      };
      const upserted = await this.positionsImport.upsertPosition(data, errors);
      if (!upserted) {
        continue;
      }
      imported += 1;
      for (const tpPositionId of group.tpPositionIds) {
        const existing = positionIdsByTpPositionId.get(tpPositionId);
        if (existing !== undefined) {
          errors.push(
            makeImportError({
              item: { starPosition: group.name, tpPositionId },
              message: `Skipping star position "${group.name}" TP id ${tpPositionId}: id already mapped to position ${existing} (catalog id collision).`,
            }),
          );
          continue;
        }
        positionIdsByTpPositionId.set(tpPositionId, upserted.id);
      }
    }

    return {
      result: makeImportResult({ imported, errors }),
      positionIdsByTpPositionId,
    };
  }
}
