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

const MISSING = 'missing-rules-set';

/**
 * Star players whose stored eligibility implies a rules set they have no
 * `position_rules_sets` row for: the star is claimed hireable in an era
 * mapping to that rules set, yet nothing says what its stat line was. Either
 * the star genuinely did not exist then — in which case the eligibility row
 * is wrong — or the characteristics are simply missing. This is the exact
 * shape `tools/import-bbl`'s star-player exception produces, so it is the
 * stratum most likely to earn its place in a run.
 */
@Injectable()
export class MissingRulesSetStratificationService implements StarPlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: MISSING,
      label:
        'Star player is missing characteristics for a rules set it is hireable under',
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
    if (stratumId !== MISSING) {
      throw new Error(
        `Unknown star player stratum "${stratumId}". Known strata: ${MISSING}.`,
      );
    }
    return await this.db
      .select({ positionId: positions.id, positionName: positions.name })
      .from(positions)
      .innerJoin(
        positionsRaceEras,
        eq(positionsRaceEras.positionId, positions.id),
      )
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
