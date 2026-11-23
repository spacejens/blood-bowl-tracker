import type { AdvancementKind } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type {
  AdvancementCostRow,
  FeedSelection,
  PricingOutcome,
  ResolvedStep,
  RulesSetPricingInput,
} from './fill-plan.types';

export interface PricingInput {
  /** The player's advancements, first taken first. */
  steps: readonly ResolvedStep[];
  /** One entry per rules set of the player's era. */
  rulesSets: readonly RulesSetPricingInput[];
}

type SkillStep = Extract<ResolvedStep, { kind: 'skill' }>;

/** What one rules set makes of the steps. */
type RulesSetPrice =
  | { kind: 'costs'; costs: (number | null)[] }
  | { kind: 'granted-skill' }
  | { kind: 'category-mismatch' };

const SKILL_KINDS: Record<
  FeedSelection,
  Record<SkillStep['category'], AdvancementKind>
> = {
  chosen: {
    primary: 'chosen_primary_skill',
    secondary: 'chosen_secondary_skill',
  },
  random: {
    primary: 'random_primary_skill',
    secondary: 'random_secondary_skill',
  },
};

/**
 * Prices a player's feed advancements, taken in the listed order, the way
 * the server's order check prices a fill (AdvancementKindCandidatesService
 * and AdvancementSpendRangeService in packages/game-data), with each step's
 * kind fixed by the report instead of left open:
 *
 * - under a rules set whose own cost rows (no league) are all table rolls,
 *   every step is a `table_roll`;
 * - otherwise a skill is `<selection>_<category>_skill` and a characteristic
 *   increase a `random_characteristic` (a chosen one has no kind);
 * - step n costs the one price the rows of its kind at advancement number n
 *   give; none, or rows that disagree, leave it unpriced.
 *
 * A skill a cost row grants (`granted_skill`) can only be that row's
 * advancement, which a report cannot show, so it is reported instead of
 * priced. So is a skill whose category the position's access under the rules
 * set puts on the other side of primary and secondary than the report: the
 * server would price it as the other kind. Every rules set of the era must
 * give the same costs. advancement-pricing.drift.spec.ts checks the result
 * against game-data's own deduction.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class AdvancementPricingService {
  price(input: PricingInput): PricingOutcome {
    const prices = input.rulesSets.map((rulesSet) =>
      this.priceUnder(input.steps, rulesSet),
    );
    if (prices.some((price) => price.kind === 'granted-skill')) {
      return { kind: 'granted-skill' };
    }
    if (prices.some((price) => price.kind === 'category-mismatch')) {
      return { kind: 'category-mismatch' };
    }
    // Only cost prices remain after the two checks above.
    const lists = prices
      .filter((price): price is Extract<RulesSetPrice, { kind: 'costs' }> => {
        return price.kind === 'costs';
      })
      .map((price) => price.costs);
    if (lists.length === 0) {
      return { kind: 'unpriced' };
    }
    const first = JSON.stringify(lists[0]);
    if (lists.some((list) => JSON.stringify(list) !== first)) {
      return { kind: 'disagree' };
    }
    const stepCosts = lists[0].filter((cost): cost is number => cost !== null);
    if (stepCosts.length !== lists[0].length) {
      return { kind: 'unpriced' };
    }
    return {
      kind: 'priced',
      stepCosts,
      total: stepCosts.reduce((sum, cost) => sum + cost, 0),
    };
  }

  /**
   * Whether the rows of any skill kind price it differently at an
   * advancement number from 1 to maxNumber: a kind price() would leave
   * unpriced for that reason. Under fixed thresholds the kind is
   * `table_roll`.
   */
  hasConflictingCosts(input: {
    costs: readonly AdvancementCostRow[];
    maxNumber: number;
  }): boolean {
    const kinds: readonly AdvancementKind[] = this.isFixedThreshold(input.costs)
      ? ['table_roll']
      : Object.values(SKILL_KINDS).flatMap((byCategory) =>
          Object.values(byCategory),
        );
    const prices = new Map<string, Set<number>>();
    for (const cost of input.costs) {
      if (
        kinds.includes(cost.advancementKind) &&
        cost.advancementNumber <= input.maxNumber
      ) {
        const key = `${cost.advancementKind}:${cost.advancementNumber}`;
        prices.set(key, (prices.get(key) ?? new Set()).add(cost.sppCost));
      }
    }
    return [...prices.values()].some((set) => set.size > 1);
  }

  private priceUnder(
    steps: readonly ResolvedStep[],
    rulesSet: RulesSetPricingInput,
  ): RulesSetPrice {
    const fixed = this.isFixedThreshold(rulesSet.costs);
    const costs: (number | null)[] = [];
    for (const [at, step] of steps.entries()) {
      if (step.kind === 'skill') {
        if (this.isGranted(step, rulesSet.costs)) {
          return { kind: 'granted-skill' };
        }
        if (!fixed && this.accessDiffers(step, rulesSet)) {
          return { kind: 'category-mismatch' };
        }
      }
      const kind = fixed ? 'table_roll' : this.kindOf(step);
      costs.push(
        kind === undefined
          ? null
          : this.costAt({ costs: rulesSet.costs, kind, number: at + 1 }),
      );
    }
    return { kind: 'costs', costs };
  }

  /** A rules set's own rows all table rolls: fixed thresholds. */
  private isFixedThreshold(costs: readonly AdvancementCostRow[]): boolean {
    const own = costs.filter((cost) => cost.leagueId === null);
    return (
      own.length > 0 &&
      own.every((cost) => cost.advancementKind === 'table_roll')
    );
  }

  private isGranted(
    step: SkillStep,
    costs: readonly AdvancementCostRow[],
  ): boolean {
    return costs.some(
      (cost) =>
        cost.advancementKind === 'granted_skill' &&
        cost.skillId === step.skillId,
    );
  }

  private accessDiffers(
    step: SkillStep,
    rulesSet: RulesSetPricingInput,
  ): boolean {
    const category = rulesSet.skillCategories.get(step.skillId);
    const access =
      category === undefined
        ? undefined
        : rulesSet.positionAccess.get(category);
    return access !== undefined && access !== step.category;
  }

  private kindOf(step: ResolvedStep): AdvancementKind | undefined {
    if (step.kind === 'characteristic') {
      return step.selection === 'random' ? 'random_characteristic' : undefined;
    }
    return SKILL_KINDS[step.selection][step.category];
  }

  /** The one price of the kind at the number; null with none, or several that differ. */
  private costAt(at: {
    costs: readonly AdvancementCostRow[];
    kind: AdvancementKind;
    number: number;
  }): number | null {
    const prices = new Set(
      at.costs
        .filter(
          (cost) =>
            cost.advancementKind === at.kind &&
            cost.advancementNumber === at.number,
        )
        .map((cost) => cost.sppCost),
    );
    return prices.size === 1 ? [...prices][0] : null;
  }
}
