import { Injectable } from '@nestjs/common';

import type {
  AdvancementCostRow,
  PositionAccessRow,
  RulesSetPricingInput,
  SkillCategoryRow,
} from './fill-plan.types';

export interface PricingRulesSetsInput {
  /** The rules sets of the player's era. */
  rulesSetIds: readonly number[];
  /** The cost rows that apply to his era. */
  costs: readonly AdvancementCostRow[];
  /** Skill categories under any rules set; each rules set takes its own. */
  skillCategories: readonly SkillCategoryRow[];
  /** His position's access rows. */
  positionAccess: readonly PositionAccessRow[];
}

/**
 * What AdvancementPricingService reads about each rules set of one player's
 * era: the rules set's cost rows, its skill categories and the position's
 * access to them.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class PricingRulesSetsService {
  build(input: PricingRulesSetsInput): RulesSetPricingInput[] {
    return input.rulesSetIds.map((rulesSetId) => ({
      rulesSetId,
      costs: input.costs.filter((cost) => cost.rulesSetId === rulesSetId),
      skillCategories: new Map(
        input.skillCategories
          .filter((row) => row.rulesSetId === rulesSetId)
          .map((row) => [row.skillId, row.category]),
      ),
      positionAccess: new Map(
        input.positionAccess
          .filter((row) => row.rulesSetId === rulesSetId)
          .map((row) => [row.category, row.access]),
      ),
    }));
  }
}
