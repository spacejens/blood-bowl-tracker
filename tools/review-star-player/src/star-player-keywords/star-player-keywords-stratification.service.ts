import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  isNull,
  positionRulesSetKeywords,
  positionRulesSets,
  positions,
  rulesSets,
  sql,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { ReviewStarPlayer, ReviewStratum } from '../shared/review.types';
import type {
  StarPlayerStratifier,
  StratumSampleRequest,
} from '../shared/star-player-stratifier';

const NO_KEYWORDS = 'bb2025-star-without-keywords';

/** The rules set whose name marks a `position_rules_sets` row as BB2025. */
const BB2025_RULES_SET_NAME = 'BB2025';

/**
 * The DB-visible shape a star-keywords mistake takes.
 *
 * A stratifier only ever sees the database -- it cannot read TP's raw `race`
 * array -- so "differs from TP" is not a stratum that can exist here. A
 * BB2025 `position_rules_sets` row with no `position_rules_set_keywords` row
 * is the closest DB-visible signal that something was dropped, exactly as
 * `KeywordCoverageStratificationService` samples for ordinary positions in
 * `tools/review-race`.
 */
@Injectable()
export class StarPlayerKeywordsStratificationService implements StarPlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: NO_KEYWORDS,
      label: 'Star player with no keyword recorded under BB2025',
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
  }: StratumSampleRequest): Promise<ReviewStarPlayer[]> {
    if (stratumId === NO_KEYWORDS) {
      return await this.noKeywords(limit);
    }
    throw new Error(
      `Unknown star player stratum "${stratumId}". Known strata: ${NO_KEYWORDS}.`,
    );
  }

  /**
   * A BB2025 `position_rules_sets` row with no matching
   * `position_rules_set_keywords` row. "BB2025" is resolved by the rules
   * set's own name, never a hard-coded id.
   */
  private async noKeywords(limit: number): Promise<ReviewStarPlayer[]> {
    return await this.db
      .select({ positionId: positions.id, positionName: positions.name })
      .from(positions)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.positionId, positions.id),
      )
      .innerJoin(rulesSets, eq(rulesSets.id, positionRulesSets.rulesSetId))
      .leftJoin(
        positionRulesSetKeywords,
        eq(positionRulesSetKeywords.positionRulesSetId, positionRulesSets.id),
      )
      .where(
        and(
          eq(positions.isStarPlayer, true),
          eq(rulesSets.name, BB2025_RULES_SET_NAME),
          isNull(positionRulesSetKeywords.id),
        ),
      )
      .groupBy(positions.id, positions.name)
      .orderBy(sql`random()`)
      .limit(limit);
  }
}
