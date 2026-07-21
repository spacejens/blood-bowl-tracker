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
   * All positions import with `isStarPlayer: false`; `starPlayersMasters` is
   * ignored. `rosters` is the already-collected roster list (via
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

    return {
      result: makeImportResult({ imported, errors }),
      positionIdsByTpPositionId,
    };
  }
}
