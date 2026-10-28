import type { SQL } from '@blood-bowl-tracker/db';
import {
  and,
  eq,
  eras,
  gte,
  isNotNull,
  isNull,
  lt,
  or,
  players,
  positions,
  sql,
} from '@blood-bowl-tracker/db';
import { ExternalSystemLookupService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const ACTIVE_RUNNING = 'status-active-running-era';
const DEAD = 'status-dead';
const RETIRED = 'status-retired';
const TEMPORARILY_RETIRED = 'status-temporarily-retired';
const UNKNOWN = 'status-unknown';
const ACTIVE_ENDED = 'status-active-ended-era';

const TODAY = sql`current_date`;

/**
 * Bounded random samples of players by stored status, so a run always
 * contains each status — dead, retired and especially temporarily retired
 * players are rare enough that a plain random sample would seldom show one,
 * and an unknown (NULL) status is exactly what a source that failed to
 * report one leaves behind.
 *
 * Active players are split by whether their era has ended (`end_date`
 * non-null and before today, decided in SQL): an active player in a closed
 * era is a different reading than one still playing. The two active strata
 * do not overlap.
 *
 * Excludes star players from every stratum: an induced star gets one
 * `players` row per hire and TP records no status for one, so they would
 * crowd the samples. `StarPlayerStratificationService` and the star player
 * review tool cover them separately.
 */
@Injectable()
export class PlayerStatusStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: ACTIVE_RUNNING,
      label: 'Active player in a running era',
      sources: ['bbl', 'tp'],
    },
    { id: DEAD, label: 'Dead player', sources: ['bbl', 'tp'] },
    { id: RETIRED, label: 'Retired player', sources: ['bbl', 'tp'] },
    {
      id: TEMPORARILY_RETIRED,
      label: 'Temporarily retired player',
      sources: ['bbl', 'tp'],
    },
    {
      id: UNKNOWN,
      label: 'Player with no reported status',
      sources: ['bbl', 'tp'],
    },
    {
      id: ACTIVE_ENDED,
      label: 'Active player in an era that has ended',
      sources: ['bbl', 'tp'],
    },
  ];

  constructor(
    private readonly externalSystems: ExternalSystemLookupService,
    private readonly query: PlayerProjectionQueryService,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    source,
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewPlayer[]> {
    const condition = and(
      eq(positions.isStarPlayer, false),
      this.filterFor(stratumId),
    ) as SQL;
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const rows = await this.query
      .base(externalSystemId)
      .where(condition)
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }

  /** The stored-status (and, for active, era) filter this stratum selects. */
  private filterFor(stratumId: string): SQL {
    switch (stratumId) {
      case ACTIVE_RUNNING:
        return and(
          eq(players.status, 'active'),
          or(isNull(eras.endDate), gte(eras.endDate, TODAY)),
        ) as SQL;
      case DEAD:
        return eq(players.status, 'dead');
      case RETIRED:
        return eq(players.status, 'retired');
      case TEMPORARILY_RETIRED:
        return eq(players.status, 'temporarily_retired');
      case UNKNOWN:
        return isNull(players.status);
      case ACTIVE_ENDED:
        return and(
          eq(players.status, 'active'),
          isNotNull(eras.endDate),
          lt(eras.endDate, TODAY),
        ) as SQL;
      default:
        throw new Error(
          `Unknown player stratum "${stratumId}". Known strata: ` +
            `${this.strata.map((stratum) => stratum.id).join(', ')}.`,
        );
    }
  }
}
