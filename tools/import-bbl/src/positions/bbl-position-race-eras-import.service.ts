import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  makeImportError,
  makeImportResult,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';

export interface SyncPositionRaceErasOptions {
  positionRaceCandidates: Map<
    number,
    { isStarPlayer: boolean; raceDbIds: Set<number> }
  >;
  positionIdsByBblId: Map<string, number>;
  racesByBblId: Map<string, { id: number; name: string }>;
  eraIdsByName: Map<string, number>;
  eraIdsByRaceId: Map<number, Set<number>>;
  positionsUsedByEra: Set<string>;
  racesActiveByEra: Set<string>;
}

@Injectable()
export class BblPositionRaceErasImportService {
  constructor(
    private readonly positionsImport: PositionsImportService,
    private readonly eraConfig: EraConfigService,
  ) {}

  /**
   * Phase 2 of the positions_race_eras heuristic (issue #153): runs entirely
   * client-side, after players are imported, over the candidate
   * (position, race) pairs Phase 1 (`BblPositionsImportService`) collected.
   *
   * For each candidate position and each race it was seen fielding, and each
   * era the race spans (`eraIdsByRaceId`), decides availability:
   *
   * 1. A config override for that (position, race, era) wins outright.
   * 2. Else a star player is always available (star player exception).
   * 3. Else a player actually used the position that era
   *    (`positionsUsedByEra`) -> available.
   * 4. Else the race fielded no teams at all that era
   *    (`racesActiveByEra` says no) -> available (absence isn't meaningful).
   * 5. Else the race was active that era but no player used the position ->
   *    unavailable.
   *
   * The final decided list per position is persisted with one
   * `PositionsImportService.syncRaceEras` call (the generic write endpoint;
   * all decision-making lives here, not there). Idempotent.
   */
  async syncPositionRaceEras({
    positionRaceCandidates,
    positionIdsByBblId,
    racesByBblId,
    eraIdsByName,
    eraIdsByRaceId,
    positionsUsedByEra,
    racesActiveByEra,
  }: SyncPositionRaceErasOptions): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    // Resolve config overrides to DB ids, grouped by positionId.
    // overridesByPositionId: positionId -> ("${raceId}:${eraId}" -> available)
    const overridesByPositionId = new Map<number, Map<string, boolean>>();
    for (const era of this.eraConfig.getEras()) {
      const eraId = eraIdsByName.get(era.identity.name);
      for (const o of era.positions ?? []) {
        const positionId = positionIdsByBblId.get(
          `${o.positionId}-${o.raceId}`,
        );
        const race = racesByBblId.get(o.raceId);
        if (
          positionId === undefined ||
          race === undefined ||
          eraId === undefined
        ) {
          errors.push(
            makeImportError({
              item: { ...o, era: era.identity.name },
              message: `Could not resolve positions override (typId ${o.positionId}, race ${o.raceId}, era "${era.identity.name}") to DB ids`,
            }),
          );
          continue;
        }
        let byRaceEra = overridesByPositionId.get(positionId);
        if (!byRaceEra) {
          byRaceEra = new Map();
          overridesByPositionId.set(positionId, byRaceEra);
        }
        byRaceEra.set(`${race.id}:${eraId}`, o.available);
      }
    }

    for (const [positionId, candidate] of positionRaceCandidates) {
      const overrides = overridesByPositionId.get(positionId);
      const raceEras: { raceId: number; eraId: number }[] = [];
      for (const raceId of candidate.raceDbIds) {
        for (const eraId of eraIdsByRaceId.get(raceId) ?? []) {
          const key = `${raceId}:${eraId}`;
          const override = overrides?.get(key);
          let include: boolean;
          if (override !== undefined) {
            include = override;
          } else if (candidate.isStarPlayer) {
            include = true;
          } else if (positionsUsedByEra.has(`${positionId}:${eraId}`)) {
            include = true;
          } else {
            include = !racesActiveByEra.has(key);
          }
          if (include) {
            raceEras.push({ raceId, eraId });
          }
        }
      }
      const result = await this.positionsImport.syncRaceEras(
        { positionId, raceEras },
        errors,
      );
      if (result) {
        imported += 1;
      }
    }

    return { result: makeImportResult({ imported, errors }) };
  }
}
