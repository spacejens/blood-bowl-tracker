import { eq, players, sql } from '@blood-bowl-tracker/db';
import { ExternalSystemLookupService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const JOURNEYMAN = 'journeyman';

/**
 * A bounded random sample of players the database marks as journeymen
 * (`players.is_journeyman`), per source. Journeymen are rare enough that a
 * plain random sample would seldom show one, and each puts the stored side
 * (the marker, a starting Loner and no gained one) beside the source's own
 * account of the player for a human to compare. Reads only stored data; the
 * raw panels interpret the sources on their own.
 */
@Injectable()
export class JourneymanStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    { id: JOURNEYMAN, label: 'Journeyman player', sources: ['bbl', 'tp'] },
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
    if (stratumId !== JOURNEYMAN) {
      throw new Error(
        `Unknown player stratum "${stratumId}". Known strata: ${JOURNEYMAN}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const rows = await this.query
      .base(externalSystemId)
      .where(eq(players.isJourneyman, true))
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }
}
