import type { Db, SQL } from '@blood-bowl-tracker/db';
import {
  DB,
  eq,
  positions,
  positionsRaceEras,
  raceEras,
  sql,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { ReviewStarPlayer, ReviewStratum } from '../shared/review.types';
import type {
  StarPlayerStratifier,
  StratumSampleRequest,
} from '../shared/star-player-stratifier';

const MERCENARY = 'mercenary';
const ROSTER_EMBEDDED = 'roster-embedded';

/**
 * The two kinds of star availability, sampled separately so a report always
 * covers both. A star hireable by several races is a mercenary — the common
 * case, and the one `tools/import-bbl`'s star-player exception can inflate;
 * a star hireable by exactly one race is effectively roster-embedded, which
 * is rarer and where a wrongly narrow eligibility row hides.
 *
 * Expressed against the database's own `positions_race_eras` -> `race_eras`
 * race count rather than against a source's notion of an embedded star,
 * because that count is precisely what the report is asking the reviewer to
 * check. TP's own data currently carries no star inside a roster's
 * `lineUpMasters` at all, so a source-side definition would sample nothing.
 */
@Injectable()
export class MercenaryVsEmbeddedStratificationService implements StarPlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: MERCENARY,
      label: 'Star player hireable by more than one race',
      sources: ['bbl', 'tp', 'manual'],
    },
    {
      id: ROSTER_EMBEDDED,
      label: 'Star player hireable by exactly one race',
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
    return await this.db
      .select({ positionId: positions.id, positionName: positions.name })
      .from(positionsRaceEras)
      .innerJoin(positions, eq(positions.id, positionsRaceEras.positionId))
      .innerJoin(raceEras, eq(raceEras.id, positionsRaceEras.raceEraId))
      .where(eq(positions.isStarPlayer, true))
      .groupBy(positions.id, positions.name)
      .having(this.having(stratumId))
      .orderBy(sql`random()`)
      .limit(limit);
  }

  /** More than one distinct race, or exactly one. */
  private having(stratumId: string): SQL {
    if (stratumId === MERCENARY) {
      return sql`count(distinct ${raceEras.raceId}) > 1`;
    }
    if (stratumId === ROSTER_EMBEDDED) {
      return sql`count(distinct ${raceEras.raceId}) = 1`;
    }
    throw new Error(
      `Unknown star player stratum "${stratumId}". Known strata: ${MERCENARY}, ${ROSTER_EMBEDDED}.`,
    );
  }
}
