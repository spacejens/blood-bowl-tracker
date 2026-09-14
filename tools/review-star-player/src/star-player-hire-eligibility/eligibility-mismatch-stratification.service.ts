import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  eraRulesSets,
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
 * Star players with partial, inconsistent `position_rules_sets` coverage:
 * the star has characteristics for at least one rules set it is hireable
 * under, but is also hireable under at least one other rules set it has no
 * characteristics row for. This is a genuine inconsistency in the curated
 * data rather than a blanket gap — some of the star's stat lines were
 * curated, so the missing ones are not simply "not done yet."
 *
 * `MissingRulesSetStratificationService` fires on ANY gap, including a star
 * with zero characteristics rows at all — that is the far more common case
 * `tools/import-bbl`'s star-player exception produces by over-linking a star
 * to essentially every era its races span. This stratum narrows to the
 * subset with mixed coverage, so it no longer duplicates that stratum's
 * candidate set: a star with characteristics for none of its eligible rules
 * sets matches `missing-rules-set` only, not this one. It is a DB-only
 * query: comparing against what BBL's "Can play for" line or TP's masks
 * actually support is the raw panel's job, since only a human can judge
 * whether a special rule really covers a given race.
 */
@Injectable()
export class EligibilityMismatchStratificationService implements StarPlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: MISMATCH,
      label:
        'Star player has characteristics for some, but not all, rules sets it is hireable under',
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
      .where(eq(positions.isStarPlayer, true))
      .groupBy(positions.id, positions.name)
      .having(
        sql`bool_or(${positionRulesSets.id} is not null) and bool_or(${positionRulesSets.id} is null)`,
      )
      .orderBy(sql`random()`)
      .limit(limit);
  }
}
