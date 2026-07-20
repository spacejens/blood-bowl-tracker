import type { UpsertPosition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  externalSystemBootstrapError,
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
  PositionsImportService,
  upsertExternalSystems,
} from '@blood-bowl-tracker/import';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import {
  collectRosters,
  unknownEraError,
} from '../races/tp-races-import.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpSourceReader } from '../source/tp-source-reader';

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
    private readonly sourceReader: TpSourceReader,
    private readonly rosterParser: RosterParserService,
    private readonly positionsImport: PositionsImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
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
   * ignored. Idempotent.
   */
  async importPositions(
    raceIdsByTeamRaceCode: Map<string, number>,
    eraIdsByName: Map<string, number>,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    let tpSystemId: number;
    const tpSystemName = this.externalSystemName.getTpSystemName();
    try {
      [tpSystemId] = await upsertExternalSystems(this.externalSystemsImport, [
        tpSystemName,
      ]);
    } catch (error) {
      errors.push(externalSystemBootstrapError([tpSystemName], error));
      return { result: makeImportResult({ imported, errors }) };
    }

    const rosters = await collectRosters(
      this.sourceReader,
      this.rosterParser,
      errors,
    );

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

    return { result: makeImportResult({ imported, errors }) };
  }
}
