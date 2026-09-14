import type { Db } from '@blood-bowl-tracker/db';
import {
  alias,
  and,
  DB,
  eq,
  lt,
  ne,
  or,
  positionRulesSets,
  positions,
  sql,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { ReviewStarPlayer, ReviewStratum } from '../shared/review.types';
import type {
  StarPlayerStratifier,
  StratumSampleRequest,
} from '../shared/star-player-stratifier';

const CHANGED = 'characteristics-changed';

/**
 * Star players whose stat line differs between two rules sets they have rows
 * for. That is either a genuine rebalancing (BB2025 re-costed and re-statted
 * much of the star catalog) or a curation slip, and only a human reading the
 * rulebook can tell which.
 *
 * A self-join on `position_rules_sets`, ordered by rules-set id so each pair
 * is considered once. Passing is compared with `is distinct from` because it
 * is nullable — `<>` against NULL is NULL, which would silently drop exactly
 * the legacy-vs-modern pairs this stratum is for.
 */
@Injectable()
export class CharacteristicsChangeStratificationService implements StarPlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: CHANGED,
      label: "Star player's characteristics changed between rules sets",
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
    if (stratumId !== CHANGED) {
      throw new Error(
        `Unknown star player stratum "${stratumId}". Known strata: ${CHANGED}.`,
      );
    }
    const other = alias(positionRulesSets, 'other_position_rules_sets');
    return await this.db
      .select({ positionId: positions.id, positionName: positions.name })
      .from(positions)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.positionId, positions.id),
      )
      .innerJoin(
        other,
        and(
          eq(other.positionId, positionRulesSets.positionId),
          lt(positionRulesSets.rulesSetId, other.rulesSetId),
        ),
      )
      .where(
        and(
          eq(positions.isStarPlayer, true),
          or(
            ne(positionRulesSets.move, other.move),
            ne(positionRulesSets.strength, other.strength),
            ne(positionRulesSets.agility, other.agility),
            ne(positionRulesSets.armour, other.armour),
            sql`${positionRulesSets.passing} is distinct from ${other.passing}`,
          ),
        ),
      )
      .groupBy(positions.id, positions.name)
      .orderBy(sql`random()`)
      .limit(limit);
  }
}
