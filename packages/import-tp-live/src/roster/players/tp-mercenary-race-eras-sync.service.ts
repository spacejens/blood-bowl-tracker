import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { PositionsService, RacesService } from '@blood-bowl-tracker/game-data';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import { Injectable } from '@nestjs/common';

import type { TpRosterContext } from '../tp-roster-context.service';

/** Options for {@link TpMercenaryRaceErasSyncService.sync}. */
export interface SyncMercenaryRaceErasOptions {
  /** The positions of the roster's imported mercenary hires; repeats collapse. */
  positionIds: number[];
  /** The hiring roster's TP race code, resolved to its race by TP external id. */
  teamRaceCode: string;
  /** The roster import's context: its TP system and its (already resolved) era. */
  context: TpRosterContext;
  errors: ImportError[];
}

/**
 * Records where a mercenary Big Guy position (e.g. "Giant Mercenary") may be
 * fielded. A mercenary appears on no TP official-list catalog, so unlike
 * regular and star positions its `positions_race_eras` rows can only be
 * derived from actual hires: every mercenary a roster hired is available to
 * that roster's race in the roster import's era. One upsert-only
 * `syncRaceEras` call per distinct position, so re-imports are harmless. An
 * unresolvable race code records one error and syncs nothing; a pair the
 * server rejects (the race has no `race_eras` row for the era) records one
 * error for that position, and the other positions still sync.
 */
@Injectable()
export class TpMercenaryRaceErasSyncService {
  constructor(
    private readonly races: RacesService,
    private readonly positions: PositionsService,
    private readonly importResults: ImportResultService,
    private readonly recorder: UpsertRecorderService,
  ) {}

  async sync({
    positionIds,
    teamRaceCode,
    context,
    errors,
  }: SyncMercenaryRaceErasOptions): Promise<void> {
    const distinct = [...new Set(positionIds)];
    if (distinct.length === 0) {
      return;
    }
    const item = { teamRaceCode, positionIds: distinct };
    const skipMessage = `Skipped the race/era availability of mercenary position(s) ${distinct.join(', ')}`;
    const race = await this.recorder.record({
      run: () =>
        this.races.resolve({
          externalSystemId: context.tpSystemId,
          externalId: teamRaceCode,
        }),
      item,
      errors,
      buildErrorMessage: (error) =>
        `${skipMessage}: resolving race code "${teamRaceCode}" failed: ${this.recorder.messageOf(error)}`,
    });
    if (race === undefined) {
      return;
    }
    if (!race.found) {
      errors.push(
        this.importResults.error({
          item,
          message: `${skipMessage}: could not resolve race code "${teamRaceCode}"`,
        }),
      );
      return;
    }
    const raceId = race.id;
    const eraId = context.era.id;
    for (const positionId of distinct) {
      await this.recorder.record({
        run: () =>
          this.positions.syncRaceEras({
            positionId,
            raceEras: [{ raceId, eraId }],
          }),
        item: { positionId, raceId, eraId },
        errors,
        buildErrorMessage: (error) =>
          `Failed to record mercenary position ${positionId} as available to race ${raceId} in era ${eraId}: ${this.recorder.messageOf(error)}`,
      });
    }
  }
}
