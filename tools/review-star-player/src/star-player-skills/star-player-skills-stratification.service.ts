import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  isNull,
  positionRulesSets,
  positionRulesSetSkills,
  positions,
  skillRulesSets,
  sql,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { ReviewStarPlayer, ReviewStratum } from '../shared/review.types';
import type {
  StarPlayerStratifier,
  StratumSampleRequest,
} from '../shared/star-player-stratifier';

const MISSING = 'missing-skills';
const NO_UNIQUE = 'no-unique-skill';

/**
 * The two DB-visible shapes a star-skills mistake takes. A stratifier only
 * ever sees the database — it cannot read a raw source file — so "differs
 * from the raw source" is not a stratum that can exist here.
 *
 * A star with a stat line but no starting skills under that rules set has
 * almost certainly lost its skills somewhere in the import; a star with no
 * `unique`-category skill anywhere has almost certainly lost its own
 * exclusive skill, which is the one thing every star has and no ordinary
 * position does. Neither is proof of a bug — some stars genuinely carry no
 * exclusive skill — which is why they are sampling strata, not assertions.
 */
@Injectable()
export class StarPlayerSkillsStratificationService implements StarPlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: MISSING,
      label:
        'Star player has a rules set with characteristics but no starting skills',
      sources: ['bbl', 'tp', 'manual'],
    },
    {
      id: NO_UNIQUE,
      label: 'Star player has no unique-category skill under any rules set',
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
    if (stratumId === MISSING) {
      return await this.missingSkills(limit);
    }
    if (stratumId === NO_UNIQUE) {
      return await this.noUniqueSkill(limit);
    }
    throw new Error(
      `Unknown star player stratum "${stratumId}". Known strata: ${MISSING}, ${NO_UNIQUE}.`,
    );
  }

  private async missingSkills(limit: number): Promise<ReviewStarPlayer[]> {
    return await this.db
      .select({ positionId: positions.id, positionName: positions.name })
      .from(positions)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.positionId, positions.id),
      )
      .leftJoin(
        positionRulesSetSkills,
        eq(positionRulesSetSkills.positionRulesSetId, positionRulesSets.id),
      )
      .where(
        and(
          eq(positions.isStarPlayer, true),
          isNull(positionRulesSetSkills.id),
        ),
      )
      .groupBy(positions.id, positions.name)
      .orderBy(sql`random()`)
      .limit(limit);
  }

  /**
   * No `unique`-category skill anywhere for this star. Expressed as a `not
   * exists` over the skill/rules-set join rather than a left join, because a
   * star with several rules sets must be excluded only when NONE of them
   * carries one.
   *
   * The subquery's tables are interpolated from the imported drizzle table
   * objects (`${positionRulesSets}`, `${positionRulesSetSkills}`,
   * `${skillRulesSets}`) rather than a hardcoded `game_data.skill_rules_sets`
   * string, so the schema-qualified name always tracks the schema drizzle
   * actually has configured.
   */
  private async noUniqueSkill(limit: number): Promise<ReviewStarPlayer[]> {
    return await this.db
      .select({ positionId: positions.id, positionName: positions.name })
      .from(positions)
      .where(
        and(
          eq(positions.isStarPlayer, true),
          sql`not exists (
            select 1
            from ${positionRulesSets} prs
            join ${positionRulesSetSkills} prss
              on prss.position_rules_set_id = prs.id
            join ${skillRulesSets} srs
              on srs.skill_id = prss.skill_id
             and srs.rules_set_id = prs.rules_set_id
            where prs.position_id = ${positions.id}
              and srs.category = 'unique'
          )`,
        ),
      )
      .orderBy(sql`random()`)
      .limit(limit);
  }
}
