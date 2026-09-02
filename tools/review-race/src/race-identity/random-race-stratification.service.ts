import type { Db } from '@blood-bowl-tracker/db';
import { DB, races } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type {
  RaceStratifier,
  StratumSampleRequest,
} from '../shared/race-stratifier';
import type { ReviewRace, ReviewStratum } from '../shared/review.types';

const RANDOM_STRATUM = 'random';

/**
 * A plain random sample of races — the baseline every report carries, so a
 * run is never made up entirely of races some rule already flagged. Random
 * rather than newest-first: a stratum that always shows the same handful of
 * races stops being a sample after the first run.
 *
 * Declared for all three sources even though the query is source-independent:
 * the sampler's race-level dedup collapses the three identical calls into one
 * `selectedFor` entry, and declaring it per source keeps the stratum list
 * uniform.
 */
@Injectable()
export class RandomRaceStratificationService implements RaceStratifier {
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
  }: StratumSampleRequest): Promise<ReviewRace[]> {
    if (stratumId !== RANDOM_STRATUM) {
      throw new Error(
        `Unknown race stratum "${stratumId}". Known strata: ${RANDOM_STRATUM}.`,
      );
    }
    return await this.db
      .select({ raceId: races.id, raceName: races.name })
      .from(races)
      .orderBy(sql`random()`)
      .limit(limit);
  }
}
