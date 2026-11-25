import type { DbOrTx } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  and,
  eq,
  eraRulesSets,
  eras,
  inArray,
  isNull,
  min,
  or,
  rulesSets,
  skillRulesSets,
} from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

import type {
  AdvancementCostRow,
  EraRulesSetRow,
  SkillCategoryRow,
} from './fill-plan.types';

/** The reads about the rules sets of the team players' eras. */
@Injectable()
export class EraRulesQueriesService {
  /** Every rules set of the eras, whether lasting injuries never heal under it, and its cheapest advancement of any kind or league. */
  async eraRulesSets(tx: DbOrTx, eraIds: number[]): Promise<EraRulesSetRow[]> {
    if (eraIds.length === 0) {
      return [];
    }
    return tx
      .select({
        eraId: eraRulesSets.eraId,
        rulesSetId: eraRulesSets.rulesSetId,
        lastingInjuriesNeverHeal: rulesSets.lastingInjuriesNeverHeal,
        cheapestCost: min(advancementCosts.sppCost),
      })
      .from(eraRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .leftJoin(
        advancementCosts,
        eq(advancementCosts.rulesSetId, eraRulesSets.rulesSetId),
      )
      .where(inArray(eraRulesSets.eraId, eraIds))
      .groupBy(
        eraRulesSets.eraId,
        eraRulesSets.rulesSetId,
        rulesSets.lastingInjuriesNeverHeal,
      );
  }

  async skillCategories(
    tx: DbOrTx,
    eraIds: number[],
  ): Promise<SkillCategoryRow[]> {
    if (eraIds.length === 0) {
      return [];
    }
    return tx
      .selectDistinct({
        skillId: skillRulesSets.skillId,
        rulesSetId: skillRulesSets.rulesSetId,
        category: skillRulesSets.category,
      })
      .from(skillRulesSets)
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, skillRulesSets.rulesSetId),
      )
      .where(inArray(eraRulesSets.eraId, eraIds));
  }

  /**
   * The advancement costs that apply to the eras: each rules set's own rows
   * and the rows of the era's league, the rows UnspentSppService
   * (packages/game-data) prices a player's advancements with.
   */
  async advancementCosts(
    tx: DbOrTx,
    eraIds: number[],
  ): Promise<AdvancementCostRow[]> {
    if (eraIds.length === 0) {
      return [];
    }
    return tx
      .select({
        eraId: eraRulesSets.eraId,
        rulesSetId: advancementCosts.rulesSetId,
        leagueId: advancementCosts.leagueId,
        advancementNumber: advancementCosts.advancementNumber,
        advancementKind: advancementCosts.advancementKind,
        skillId: advancementCosts.skillId,
        sppCost: advancementCosts.sppCost,
      })
      .from(eraRulesSets)
      .innerJoin(eras, eq(eras.id, eraRulesSets.eraId))
      .innerJoin(
        advancementCosts,
        and(
          eq(advancementCosts.rulesSetId, eraRulesSets.rulesSetId),
          or(
            isNull(advancementCosts.leagueId),
            eq(advancementCosts.leagueId, eras.leagueId),
          ),
        ),
      )
      .where(inArray(eraRulesSets.eraId, eraIds));
  }
}
