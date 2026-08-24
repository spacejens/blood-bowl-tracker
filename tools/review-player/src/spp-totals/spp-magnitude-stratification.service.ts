import { players } from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { between, eq, gte, sql } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const ZERO_STRATUM = 'spp-zero';
const SMALL_STRATUM = 'spp-small';
const LARGE_STRATUM = 'spp-large';

/** Inclusive upper bound of the "small" band. */
const SMALL_MAX = 20;
/** Inclusive lower bound of the "large" band. */
const LARGE_MIN = 100;

/**
 * Three bounded random samples across the range of stored SPP totals: players
 * with none, players with a little, players with a lot. A player's total can
 * span zero to several hundred, and different magnitudes stress different
 * parts of the SPP pipeline; a single undifferentiated random sample happens
 * to under-cover the extremes, which is where import bugs hide.
 *
 * Reads `players.spp_total` — the stored, displayed figure, the same one
 * `SppDiscrepancyStratificationService` and the Discord bot's deep-dive and
 * leaderboards treat as authoritative — and it is meaningful for both sources
 * (for BBL it is the era-correct event sum plus adjustment, per
 * `SppAdjustmentsService`'s invariant).
 *
 * The "small" band is spelled as the integer range 1..20 rather than
 * `0 < spp_total <= 20`; `spp_total` is an integer column, so the two are
 * equivalent, and `between` keeps the filter a single condition.
 *
 * No explicit star-player exclusion is needed: an induced star player commonly
 * has a NULL `spp_total` (no source-reported total — see
 * `SppDiscrepancyStratificationService`'s doc comment), and SQL's NULL
 * comparison semantics mean a NULL matches none of the three range filters, so
 * such a player drops out without a special case.
 */
@Injectable()
export class SppMagnitudeStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    { id: ZERO_STRATUM, label: 'Zero SPP total', sources: ['bbl', 'tp'] },
    {
      id: SMALL_STRATUM,
      label: `Small SPP total (1-${SMALL_MAX})`,
      sources: ['bbl', 'tp'],
    },
    {
      id: LARGE_STRATUM,
      label: `Large SPP total (${LARGE_MIN}+)`,
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
    const condition = this.filterFor(stratumId);
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const rows = await this.query
      .base(externalSystemId)
      .where(condition)
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }

  /** The stored-total range this stratum selects. */
  private filterFor(stratumId: string): SQL {
    switch (stratumId) {
      case ZERO_STRATUM:
        return eq(players.sppTotal, 0);
      case SMALL_STRATUM:
        return between(players.sppTotal, 1, SMALL_MAX);
      case LARGE_STRATUM:
        return gte(players.sppTotal, LARGE_MIN);
      default:
        throw new Error(
          `Unknown player stratum "${stratumId}". Known strata: ` +
            `${ZERO_STRATUM}, ${SMALL_STRATUM}, ${LARGE_STRATUM}.`,
        );
    }
  }
}
