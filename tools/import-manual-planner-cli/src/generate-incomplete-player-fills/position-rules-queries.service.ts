import type { DbOrTx } from '@blood-bowl-tracker/db';
import {
  and,
  eq,
  eraRulesSets,
  keywords,
  positionRulesSetKeywords,
  positionRulesSets,
  positionRulesSetSkillCategories,
  positionRulesSetSkills,
  rulesSets,
  skillExternalIds,
} from '@blood-bowl-tracker/db';
import {
  BIG_GUY_KEYWORD_NAME,
  NAME_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type {
  BigGuyPositionRow,
  PositionAccessRow,
  PositionRulesSetRow,
  PositionSkillRow,
} from './fill-plan.types';
import type { PositionEra } from './fill-query.types';
import { FillQueryScopeService } from './fill-query-scope.service';
import { FillRowShapesService } from './fill-row-shapes.service';

/** The position columns the era-scoped reads compare against their (position, era) pairs. */
const POSITION_ERA = {
  position: positionRulesSets.positionId,
  era: eraRulesSets.eraId,
};

/** The reads about positions under the rules sets of an era. */
@Injectable()
export class PositionRulesQueriesService {
  constructor(
    private readonly scope: FillQueryScopeService,
    private readonly shapes: FillRowShapesService,
  ) {}

  async positionRulesSets(
    tx: DbOrTx,
    pairs: PositionEra[],
  ): Promise<PositionRulesSetRow[]> {
    if (pairs.length === 0) {
      return [];
    }
    const rows = await tx
      .select({
        positionRulesSetId: positionRulesSets.id,
        positionId: positionRulesSets.positionId,
        eraId: eraRulesSets.eraId,
        rulesSetId: positionRulesSets.rulesSetId,
        move: positionRulesSets.move,
        strength: positionRulesSets.strength,
        agility: positionRulesSets.agility,
        passing: positionRulesSets.passing,
        armour: positionRulesSets.armour,
        moveFormat: rulesSets.moveFormat,
        strengthFormat: rulesSets.strengthFormat,
        agilityFormat: rulesSets.agilityFormat,
        passingFormat: rulesSets.passingFormat,
        armourFormat: rulesSets.armourFormat,
      })
      .from(positionRulesSets)
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, positionRulesSets.rulesSetId),
      )
      .innerJoin(rulesSets, eq(rulesSets.id, positionRulesSets.rulesSetId))
      .where(this.scope.positionEraIn(POSITION_ERA, pairs));
    return rows.map((row) => ({
      positionRulesSetId: row.positionRulesSetId,
      positionId: row.positionId,
      eraId: row.eraId,
      rulesSetId: row.rulesSetId,
      line: this.shapes.line(row),
      formats: this.shapes.formats(row),
    }));
  }

  /** One row per starting skill, named by its first `Name`-system id; null when it has none. */
  async positionSkills(
    tx: DbOrTx,
    pairs: PositionEra[],
  ): Promise<PositionSkillRow[]> {
    if (pairs.length === 0) {
      return [];
    }
    return tx
      .selectDistinctOn([positionRulesSetSkills.id], {
        positionRulesSetId: positionRulesSetSkills.positionRulesSetId,
        skillId: positionRulesSetSkills.skillId,
        nameId: skillExternalIds.externalId,
        attributeValue: positionRulesSetSkills.attributeValue,
      })
      .from(positionRulesSetSkills)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.id, positionRulesSetSkills.positionRulesSetId),
      )
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, positionRulesSets.rulesSetId),
      )
      .leftJoin(
        skillExternalIds,
        and(
          eq(skillExternalIds.skillId, positionRulesSetSkills.skillId),
          eq(
            skillExternalIds.externalSystemId,
            this.scope.externalSystemId(NAME_EXTERNAL_SYSTEM_NAME),
          ),
        ),
      )
      .where(this.scope.positionEraIn(POSITION_ERA, pairs))
      .orderBy(positionRulesSetSkills.id, skillExternalIds.externalId);
  }

  async positionAccess(
    tx: DbOrTx,
    pairs: PositionEra[],
  ): Promise<PositionAccessRow[]> {
    if (pairs.length === 0) {
      return [];
    }
    return tx
      .selectDistinct({
        positionId: positionRulesSets.positionId,
        rulesSetId: positionRulesSets.rulesSetId,
        category: positionRulesSetSkillCategories.skillCategory,
        access: positionRulesSetSkillCategories.access,
      })
      .from(positionRulesSetSkillCategories)
      .innerJoin(
        positionRulesSets,
        eq(
          positionRulesSets.id,
          positionRulesSetSkillCategories.positionRulesSetId,
        ),
      )
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, positionRulesSets.rulesSetId),
      )
      .where(
        and(
          eq(positionRulesSetSkillCategories.removed, false),
          this.scope.positionEraIn(POSITION_ERA, pairs),
        ),
      );
  }

  /**
   * Each candidate position and era where the position carries the Big Guy
   * keyword under a rules set of the era: not a basic position, so a marked
   * journeyman in it is not filled.
   */
  async bigGuyPositions(
    tx: DbOrTx,
    pairs: PositionEra[],
  ): Promise<BigGuyPositionRow[]> {
    if (pairs.length === 0) {
      return [];
    }
    return tx
      .selectDistinct({
        positionId: positionRulesSets.positionId,
        eraId: eraRulesSets.eraId,
      })
      .from(positionRulesSetKeywords)
      .innerJoin(keywords, eq(keywords.id, positionRulesSetKeywords.keywordId))
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.id, positionRulesSetKeywords.positionRulesSetId),
      )
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, positionRulesSets.rulesSetId),
      )
      .where(
        and(
          eq(keywords.name, BIG_GUY_KEYWORD_NAME),
          this.scope.positionEraIn(POSITION_ERA, pairs),
        ),
      );
  }
}
