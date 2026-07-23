import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { StarPositionUsage } from '../players/tp-players-import.service';

export interface SyncStarPositionRaceErasOptions {
  starPositionUsages: StarPositionUsage[];
  raceIdsByTeamRaceCode: Map<string, number>;
  eraIdsByName: Map<string, number>;
}

@Injectable()
export class TpPositionRaceErasImportService {
  constructor(
    private readonly positionsImport: PositionsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Post-players step (issue #234): populate `positions_race_eras` for TP
   * *star* positions, whose availability TP states nowhere and must be derived
   * from actual usage. `TpPlayersImportService` emits one `StarPositionUsage`
   * per imported star-position player (across the embedded-roster,
   * match-embedded, mercenary Big Guy and inducements-hired paths). This step
   * resolves each usage's raw `(teamRaceCode, era)` references to numeric
   * `(raceId, eraId)`, dedupes the pairs per star position, and persists them
   * with one `PositionsImportService.syncRaceEras` call per position -- the
   * same upsert-only write path the regular-position sync and the BBL importer
   * use, so repeated imports are safe.
   *
   * A usage whose race code or era name cannot be resolved is recorded as a
   * non-fatal `ImportError` and skipped; the remaining usages are still
   * processed. Regular (non-star) positions never reach this step -- they are
   * handled by `TpPositionsImportService`.
   */
  async syncStarPositionRaceEras({
    starPositionUsages,
    raceIdsByTeamRaceCode,
    eraIdsByName,
  }: SyncStarPositionRaceErasOptions): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    // positionId -> ("raceId:eraId" -> { raceId, eraId }) for per-position dedup.
    const pairsByPosition = new Map<
      number,
      Map<string, { raceId: number; eraId: number }>
    >();

    for (const usage of starPositionUsages) {
      const raceId = raceIdsByTeamRaceCode.get(usage.teamRaceCode);
      const eraId = eraIdsByName.get(usage.era);
      if (raceId === undefined || eraId === undefined) {
        errors.push(
          this.importResults.error({
            item: {
              positionId: usage.positionId,
              teamRaceCode: usage.teamRaceCode,
              era: usage.era,
            },
            message:
              `Skipping star position ${usage.positionId} usage: could not ` +
              `resolve ${
                raceId === undefined
                  ? `race code "${usage.teamRaceCode}"`
                  : `era "${usage.era}"`
              }`,
          }),
        );
        continue;
      }
      let pairs = pairsByPosition.get(usage.positionId);
      if (!pairs) {
        pairs = new Map();
        pairsByPosition.set(usage.positionId, pairs);
      }
      pairs.set(`${raceId}:${eraId}`, { raceId, eraId });
    }

    for (const [positionId, pairs] of pairsByPosition) {
      const result = await this.positionsImport.syncRaceEras(
        { positionId, raceEras: [...pairs.values()] },
        errors,
      );
      if (result) {
        imported += 1;
      }
    }

    return { result: this.importResults.result({ imported, errors }) };
  }
}
