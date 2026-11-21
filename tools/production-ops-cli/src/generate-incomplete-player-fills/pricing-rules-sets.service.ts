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

  /** Whether one rules set gives a category two different accesses; identical duplicates are fine. */
  hasConflictingAccess(rows: readonly PositionAccessRow[]): boolean {
    const seen = new Map<string, string>();
    return rows.some((row) => {
      const key = JSON.stringify([row.rulesSetId, row.category]);
      const earlier = seen.get(key);
      seen.set(key, row.access);
      return earlier !== undefined && earlier !== row.access;
    });
  }
}
