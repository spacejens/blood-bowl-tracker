import { positions } from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const STAR_PLAYER_STRATUM = 'star-players';

/**
 * A random sample of star players, kept in its own bounded stratum rather
 * than mixed into the regular random sample: a popular star gets induced by
 * many teams, so today's data model gives them one `players` row per hire
 * (see issue #245) — if left in the general pool they crowd out ordinary
 * players in a report several-fold. Random-sample and discrepancy strata
 * both exclude star players outright; this is the only place they appear,
 * and — unlike the discrepancy stratum — this one obeys `limit`, since an
 * uncapped star-player stratum would reintroduce the same overrepresentation
 * it exists to avoid.
 */
@Injectable()
export class StarPlayerStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    { id: STAR_PLAYER_STRATUM, label: 'Star players', sources: ['bbl', 'tp'] },
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
    if (stratumId !== STAR_PLAYER_STRATUM) {
      throw new Error(
        `Unknown player stratum "${stratumId}". Known strata: ${STAR_PLAYER_STRATUM}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const rows = await this.query
      .base(externalSystemId)
      .where(eq(positions.isStarPlayer, true))
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }
}
