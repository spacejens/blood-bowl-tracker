import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const RANDOM_STRATUM = 'random';

/**
 * A plain random sample of players known to a source. Random rather than
 * newest-first: a stratum that always shows the same handful of most recent
 * players stops being a sample after the first run.
 */
@Injectable()
export class RandomPlayerStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    { id: RANDOM_STRATUM, label: 'Random sample', sources: ['bbl', 'tp'] },
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
    if (stratumId !== RANDOM_STRATUM) {
      throw new Error(
        `Unknown player stratum "${stratumId}". Known strata: ${RANDOM_STRATUM}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const rows = await this.query
      .base(externalSystemId)
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }
}
