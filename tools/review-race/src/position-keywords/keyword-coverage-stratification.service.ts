import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  isNull,
  positionRulesSetKeywords,
  positionRulesSets,
  positions,
  positionsRaceEras,
  raceEras,
  races,
  rulesSets,
  sql,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type {
  RaceStratifier,
  StratumSampleRequest,
} from '../shared/race-stratifier';
import type { ReviewRace, ReviewStratum } from '../shared/review.types';

const NO_KEYWORDS = 'bb2025-position-without-keywords';
const MANY_KEYWORDS = 'position-with-several-keywords';

/** The rules set whose name marks a `position_rules_sets` row as BB2025. */
const BB2025_RULES_SET_NAME = 'BB2025';

/** From how many keywords a position counts as carrying "several". */
const SEVERAL_KEYWORDS_THRESHOLD = 3;

/**
 * The two DB-visible shapes a keyword mistake takes.
 *
 * A stratifier only ever sees the database — it cannot read TP's raw `race`
 * array — so "differs from TP" is not a stratum that can exist here. A
 * BB2025 `position_rules_sets` row with no `position_rules_set_keywords` row
 * is the closest DB-visible signal that something was dropped; a position
 * carrying three or more keywords is a useful stratum for the opposite
 * failure — an extra or misresolved code. Positional keywords stack on top
 * of species keywords, so roughly a fifth of BB2025 positions now reach this
 * threshold — this stratum is a sizeable, not a rare, slice of positions —
 * but a longer keyword list is still where one wrong or duplicated entry is
 * easiest for a human reviewer to miss among several correct-looking ones.
 *
 * Both are expressed race-first ("this race has at least one such
 * position"), because races are the sampling unit.
 */
@Injectable()
export class KeywordCoverageStratificationService implements RaceStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: NO_KEYWORDS,
      label: 'Race has a BB2025 position with no keyword recorded',
      sources: ['tp', 'manual'],
    },
    {
      id: MANY_KEYWORDS,
      label: 'Race has a position carrying three or more keywords',
      sources: ['tp', 'manual'],
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
    if (stratumId === NO_KEYWORDS) {
      return await this.noKeywords(limit);
    }
    if (stratumId === MANY_KEYWORDS) {
      return await this.manyKeywords(limit);
    }
    throw new Error(
      `Unknown race stratum "${stratumId}". Known strata: ${NO_KEYWORDS}, ${MANY_KEYWORDS}.`,
    );
  }

  /**
   * A BB2025 `position_rules_sets` row with no matching
   * `position_rules_set_keywords` row. "BB2025" is resolved by the rules
   * set's own name, never a hard-coded id.
   */
  private async noKeywords(limit: number): Promise<ReviewRace[]> {
    return await this.db
      .select({ raceId: races.id, raceName: races.name })
      .from(races)
      .innerJoin(raceEras, eq(raceEras.raceId, races.id))
      .innerJoin(
        positionsRaceEras,
        eq(positionsRaceEras.raceEraId, raceEras.id),
      )
      .innerJoin(positions, eq(positions.id, positionsRaceEras.positionId))
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.positionId, positionsRaceEras.positionId),
      )
      .innerJoin(rulesSets, eq(rulesSets.id, positionRulesSets.rulesSetId))
      .leftJoin(
        positionRulesSetKeywords,
        eq(positionRulesSetKeywords.positionRulesSetId, positionRulesSets.id),
      )
      .where(
        and(
          eq(positions.isStarPlayer, false),
          eq(rulesSets.name, BB2025_RULES_SET_NAME),
          isNull(positionRulesSetKeywords.id),
        ),
      )
      .groupBy(races.id, races.name)
      .orderBy(sql`random()`)
      .limit(limit);
  }

  /**
   * A `position_rules_sets` row whose keyword count is at or above the
   * "several" threshold, via a correlated subquery so the count is per
   * position rather than aggregated across the whole race.
   */
  private async manyKeywords(limit: number): Promise<ReviewRace[]> {
    const keywordCount = sql`(select count(*) from ${positionRulesSetKeywords} k
         where k.position_rules_set_id = ${positionRulesSets.id})`;
    return await this.db
      .select({ raceId: races.id, raceName: races.name })
      .from(races)
      .innerJoin(raceEras, eq(raceEras.raceId, races.id))
      .innerJoin(
        positionsRaceEras,
        eq(positionsRaceEras.raceEraId, raceEras.id),
      )
      .innerJoin(positions, eq(positions.id, positionsRaceEras.positionId))
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.positionId, positionsRaceEras.positionId),
      )
      .where(
        and(
          eq(positions.isStarPlayer, false),
          sql`${keywordCount} >= ${SEVERAL_KEYWORDS_THRESHOLD}`,
        ),
      )
      .groupBy(races.id, races.name)
      .orderBy(sql`random()`)
      .limit(limit);
  }
}
