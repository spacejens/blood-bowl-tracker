import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  eraRulesSets,
  isNull,
  positionRulesSets,
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

const MISMATCH = 'eligibility-mismatch';

/**
 * Star players claimed hireable in an era whose rules set they have no
 * characteristics row for. Read from the eligibility side rather than the
 * characteristics side (which is what `MissingRulesSetStratificationService`
 * does), this is the same inconsistency seen from the direction a reviewer
 * checking hire eligibility cares about: the DB says "this race could hire
 * this star in this era" while nothing in the data says what the star's stat
 * line was then.
 *
 * `tools/import-bbl`'s star-player exception links a star as available in
 * essentially every era its races span, so this is where over-linking
 * surfaces. It is a DB-only query: comparing against what BBL's "Can play
 * for" line or TP's masks actually support is the raw panel's job, since only
 * a human can judge whether a special rule really covers a given race.
 */
@Injectable()
export class EligibilityMismatchStratificationService implements StarPlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: MISMATCH,
      label:
        'Star player is hireable in an era whose rules set it has no characteristics for',
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
    if (stratumId !== MISMATCH) {
      throw new Error(
        `Unknown star player stratum "${stratumId}". Known strata: ${MISMATCH}.`,
      );
    }
    return await this.db
      .select({ positionId: positions.id, positionName: positions.name })
      .from(positionsRaceEras)
      .innerJoin(positions, eq(positions.id, positionsRaceEras.positionId))
      .innerJoin(raceEras, eq(raceEras.id, positionsRaceEras.raceEraId))
      .innerJoin(eraRulesSets, eq(eraRulesSets.eraId, raceEras.eraId))
      .leftJoin(
        positionRulesSets,
        and(
          eq(positionRulesSets.positionId, positions.id),
          eq(positionRulesSets.rulesSetId, eraRulesSets.rulesSetId),
        ),
      )
      .where(
        and(eq(positions.isStarPlayer, true), isNull(positionRulesSets.id)),
      )
      .groupBy(positions.id, positions.name)
      .orderBy(sql`random()`)
      .limit(limit);
  }
}
