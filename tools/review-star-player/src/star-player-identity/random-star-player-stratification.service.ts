import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, positions, sql } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { ReviewStarPlayer, ReviewStratum } from '../shared/review.types';
import type {
  StarPlayerStratifier,
  StratumSampleRequest,
} from '../shared/star-player-stratifier';

const RANDOM_STRATUM = 'random';

/**
 * A plain random sample of star players — the baseline every report carries,
 * so a run is never made up entirely of stars some rule already flagged.
 * Random rather than newest-first: a stratum that always shows the same
 * handful of stars stops being a sample after the first run.
 *
 * Declared for all three sources even though the query is source-independent:
 * the sampler only ever samples a stratum once (using the first declared
 * source), so listing all three is purely descriptive.
 */
@Injectable()
export class RandomStarPlayerStratificationService implements StarPlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: RANDOM_STRATUM,
      label: 'Random sample',
      sources: ['bbl', 'tp', 'manual'],
    },
  ];

  constructor(@Inject(DB) private readonly db: Db) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewStarPlayer[]> {
    if (stratumId !== RANDOM_STRATUM) {
      throw new Error(
        `Unknown star player stratum "${stratumId}". Known strata: ${RANDOM_STRATUM}.`,
      );
    }
    return await this.db
      .select({ positionId: positions.id, positionName: positions.name })
      .from(positions)
      .where(eq(positions.isStarPlayer, true))
      .orderBy(sql`random()`)
      .limit(limit);
  }
}
