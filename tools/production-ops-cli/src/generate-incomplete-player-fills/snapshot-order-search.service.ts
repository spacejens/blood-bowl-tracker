import type { SkillAccess } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import { AdvancementPricingService } from './advancement-pricing.service';
import type {
  FeedSelection,
  ResolvedStep,
  RulesSetPricingInput,
} from './fill-plan.types';

/** A gained skill a snapshot shows, resolved and named. */
export interface GainedSkill {
  skillId: number;
  skillName: string;
  nameId: string;
}

export type SnapshotStep = Extract<ResolvedStep, { kind: 'skill' }>;

export interface OrderSearchInput {
  /** His gained skills, in no known order. */
  skills: readonly GainedSkill[];
  /** One entry per rules set of his era. */
  rulesSets: readonly RulesSetPricingInput[];
  /** His total minus his unspent SPP. */
  spent: number;
}

export type OrderSearchOutcome =
  | { kind: 'unique'; steps: SnapshotStep[] }
  | { kind: 'none' }
  | { kind: 'ambiguous' }
  | { kind: 'granted-skill' }
  | { kind: 'category-mismatch' }
  | { kind: 'disagree' };

type CategorisedSkill = GainedSkill & { category: SkillAccess };

const SELECTIONS: readonly FeedSelection[] = ['chosen', 'random'];

/**
 * Finds the one order, and the one chosen-or-random source of each skill,
 * in which a player's gained skills cost exactly the SPP he spent. A roster
 * snapshot shows neither. Each skill is primary or secondary by the
 * position's access to its category, which must be the same under every
 * rules set of the era. Every order and every assignment is priced with
 * AdvancementPricingService, so each is priced the way the server's order
 * check prices a fill. Exactly one that fits proves the steps; none, or
 * more than one, proves nothing. A granted skill, a category mismatch or
 * rules sets that disagree end the search, since no order changes them.
 *
 * Pure decision logic, with no I/O; its collaborator is pure as well.
 */
@Injectable()
export class SnapshotOrderSearchService {
  constructor(private readonly pricing: AdvancementPricingService) {}

  search(input: OrderSearchInput): OrderSearchOutcome {
    const skills = this.categorised(input);
    if (skills === undefined) {
      return { kind: 'category-mismatch' };
    }
    let found: SnapshotStep[] | undefined;
    for (const steps of this.candidates(skills)) {
      const outcome = this.pricing.price({ steps, rulesSets: input.rulesSets });
      if (
        outcome.kind === 'granted-skill' ||
        outcome.kind === 'category-mismatch' ||
        outcome.kind === 'disagree'
      ) {
        return { kind: outcome.kind };
      }
      if (outcome.kind !== 'priced' || outcome.total !== input.spent) {
        continue;
      }
      if (found !== undefined) {
        return { kind: 'ambiguous' };
      }
      found = steps.map((step, at) => ({
        ...step,
        reportedCost: outcome.stepCosts[at],
      }));
    }
    return found === undefined
      ? { kind: 'none' }
      : { kind: 'unique', steps: found };
  }

  /** Each skill with its one access across the rules sets; undefined when any has none or several. */
  private categorised(input: OrderSearchInput): CategorisedSkill[] | undefined {
    const skills: CategorisedSkill[] = [];
    for (const skill of input.skills) {
      const accesses = new Set(
        input.rulesSets.flatMap((rulesSet) => {
          const category = rulesSet.skillCategories.get(skill.skillId);
          const access =
            category === undefined
              ? undefined
              : rulesSet.positionAccess.get(category);
          return access === undefined ? [] : [access];
        }),
      );
      if (accesses.size !== 1) {
        return undefined;
      }
      skills.push({ ...skill, category: [...accesses][0] });
    }
    return skills;
  }

  /** Every order of the skills, each with every chosen-or-random assignment. */
  private *candidates(
    skills: readonly CategorisedSkill[],
  ): Generator<SnapshotStep[]> {
    for (const order of this.permutations(skills)) {
      for (const selections of this.selections(order.length)) {
        yield order.map((skill, at) => ({
          kind: 'skill',
          skillId: skill.skillId,
          skillName: skill.skillName,
          nameId: skill.nameId,
          attributeValue: null,
          selection: selections[at],
          category: skill.category,
          reportedCost: 0,
        }));
      }
    }
  }

  private *permutations<T>(items: readonly T[]): Generator<T[]> {
    if (items.length === 0) {
      yield [];
      return;
    }
    for (const [at, item] of items.entries()) {
      const rest = [...items.slice(0, at), ...items.slice(at + 1)];
      for (const tail of this.permutations(rest)) {
        yield [item, ...tail];
      }
    }
  }

  private *selections(count: number): Generator<FeedSelection[]> {
    if (count === 0) {
      yield [];
      return;
    }
    for (const tail of this.selections(count - 1)) {
      for (const selection of SELECTIONS) {
        yield [selection, ...tail];
      }
    }
  }
}
