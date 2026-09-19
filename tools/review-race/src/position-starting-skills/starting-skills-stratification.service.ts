import type { Db } from '@blood-bowl-tracker/db';
import {
  alias,
  and,
  DB,
  eq,
  isNull,
  lt,
  positionRulesSets,
  positionRulesSetSkills,
  positions,
  positionsRaceEras,
  raceEras,
  races,
  skillRulesSets,
  sql,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type {
  RaceStratifier,
  StratumSampleRequest,
} from '../shared/race-stratifier';
import type { ReviewRace, ReviewStratum } from '../shared/review.types';

const CHANGED = 'starting-skills-changed';
const NOT_IN_RULES_SET = 'starting-skill-not-in-rules-set';

/**
 * The two DB-visible shapes a starting-skills mistake takes.
 *
 * A stratifier only ever sees the database — it cannot read a raw source file
 * — so "differs from the raw source" is not a stratum that can exist here.
 * These two are the closest DB-expressible signals: a position whose skill
 * set moved between two rules sets (a genuine rules change, or a curation
 * slip, and only a human with the rulebook can tell which), and a stored
 * starting skill that has no `skill_rules_sets` row for the very rules set it
 * is recorded under, which is always wrong.
 *
 * Both are expressed race-first ("this race has at least one such position"),
 * because races are the sampling unit.
 */
@Injectable()
export class StartingSkillsStratificationService implements RaceStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: CHANGED,
      label:
        'Race has a position whose starting skills changed between rules sets',
      sources: ['bbl', 'tp', 'manual'],
    },
    {
      id: NOT_IN_RULES_SET,
      label:
        'Race has a position with a starting skill that rules set does not have',
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
    if (stratumId === CHANGED) {
      return await this.changed(limit);
    }
    if (stratumId === NOT_IN_RULES_SET) {
      return await this.notInRulesSet(limit);
    }
    throw new Error(
      `Unknown race stratum "${stratumId}". Known strata: ${CHANGED}, ${NOT_IN_RULES_SET}.`,
    );
  }

  /**
   * A self-join on `position_rules_sets`, ordered by rules-set id so each
   * pair is considered once, comparing the two rows' sorted skill-id arrays.
   * `is distinct from` (not `<>`) because a row with no skills at all
   * aggregates to an empty array on one side and a populated one on the
   * other, and that difference must count.
   */
  private async changed(limit: number): Promise<ReviewRace[]> {
    const other = alias(positionRulesSets, 'other_position_rules_sets');
    const skillIds = (rowId: typeof positionRulesSets.id) =>
      sql`(select coalesce(array_agg(s.skill_id order by s.skill_id), '{}')
           from ${positionRulesSetSkills} s
           where s.position_rules_set_id = ${rowId})`;
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
      .innerJoin(
        other,
        and(
          eq(other.positionId, positionRulesSets.positionId),
          lt(positionRulesSets.rulesSetId, other.rulesSetId),
        ),
      )
      .where(
        and(
          eq(positions.isStarPlayer, false),
          sql`${skillIds(positionRulesSets.id)} is distinct from ${skillIds(other.id)}`,
        ),
      )
      .groupBy(races.id, races.name)
      .orderBy(sql`random()`)
      .limit(limit);
  }

  /** A stored starting skill the rules set it is recorded under does not have. */
  private async notInRulesSet(limit: number): Promise<ReviewRace[]> {
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
      .innerJoin(
        positionRulesSetSkills,
        eq(positionRulesSetSkills.positionRulesSetId, positionRulesSets.id),
      )
      .leftJoin(
        skillRulesSets,
        and(
          eq(skillRulesSets.skillId, positionRulesSetSkills.skillId),
          eq(skillRulesSets.rulesSetId, positionRulesSets.rulesSetId),
        ),
      )
      .where(and(eq(positions.isStarPlayer, false), isNull(skillRulesSets.id)))
      .groupBy(races.id, races.name)
      .orderBy(sql`random()`)
      .limit(limit);
  }
}
