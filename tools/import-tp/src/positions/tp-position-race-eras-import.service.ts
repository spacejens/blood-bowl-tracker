import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  PositionsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraDataConfigService } from '../eras/era-data-config.service';
import type { StarPositionUsage } from '../players/tp-players-import.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

export interface SyncStarPositionRaceErasOptions {
  starPositionUsages: StarPositionUsage[];
}

@Injectable()
export class TpPositionRaceErasImportService {
  constructor(
    private readonly positionsImport: PositionsImportService,
    private readonly importResults: ImportResultService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly eraDataConfig: EraDataConfigService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Post-players step: populate `positions_race_eras` for TP *star* positions.
   * TP states provide no availability for star positions, so it must be
   * derived from actual usage instead. `TpPlayersImportService` emits one
   * `StarPositionUsage` per imported star-position player (across the
   * embedded-roster, match-embedded, mercenary Big Guy and inducements-hired
   * paths). This step resolves each usage's raw `(teamRaceCode, era)`
   * references to numeric `(raceId, eraId)`, dedupes the pairs per star
   * position, and persists them with one
   * `PositionsImportService.syncRaceEras` call per position -- the same
   * upsert-only write path the regular-position sync and the BBL importer
   * use, so repeated imports are safe.
   *
   * A usage whose race code or era name cannot be resolved is recorded as a
   * non-fatal `ImportError` and skipped; the remaining usages are still
   * processed. Regular (non-star) positions never reach this step -- they are
   * handled by `TpPositionsImportService`.
   */
  async syncStarPositionRaceEras({
    starPositionUsages,
  }: SyncStarPositionRaceErasOptions): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: this.importResults.result({ imported, errors }) };
    }
    const [tpSystemId] = bootstrap.ids;

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
      return { result: this.importResults.result({ imported, errors }) };
    }
    const [eraIds, raceIds] = await Promise.all([
      this.lookup.lookupMap(
        'era',
        eraNames.map((name) => ({
          externalSystemId: tpSystemId,
          externalId: name,
        })),
      ),
      this.lookup.lookupMap(
        'race',
        [...new Set(starPositionUsages.map((u) => u.teamRaceCode))].map(
          (code) => ({ externalSystemId: tpSystemId, externalId: code }),
        ),
      ),
    ]);

    // positionId -> ("raceId:eraId" -> { raceId, eraId }) for per-position dedup.
    const pairsByPosition = new Map<
      number,
      Map<string, { raceId: number; eraId: number }>
    >();

    for (const usage of starPositionUsages) {
      const raceId = raceIds.get(
        this.lookup.keyOf({
          externalSystemId: tpSystemId,
          externalId: usage.teamRaceCode,
        }),
      );
      const eraId = eraIds.get(
        this.lookup.keyOf({
          externalSystemId: tpSystemId,
          externalId: usage.era,
        }),
      );
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
