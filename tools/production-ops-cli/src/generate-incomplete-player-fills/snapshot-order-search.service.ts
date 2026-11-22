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
  /**
   * Skills the TP feed reports, whose place each admissible order must
   * honour, given oldest first: the order must also place them in that
   * sequence. Empty or absent when the feed names none.
   */
  fixed?: readonly SnapshotStep[];
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
 * Rows of a kind and number the search can reach that price it differently
 * (a league's row beside the rules set's own) leave a candidate undecidable,
 * not impossible, so they end the search as disagreement instead of being
 * skipped. A kind with no row at all is impossible and is skipped.
 *
 * The search prices n!·2^n candidates, so callers must cap the skill count.
 * Identical duplicate skill entries count as distinct skills, so they yield
 * `ambiguous`. A skill a rules set does not categorise is not access-checked
 * under that set.
 *
 * Fixed reports, which the TP feed shows, narrow the candidates to those
 * placing each reported skill at an advancement whose price is the shown
 * cost, with the shown selection and category, and in the order the reports
 * were given (oldest first); a report that names no gained skill, names one
 * twice or has a variant leaves no candidate.
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
    if (
      input.rulesSets.some((rulesSet) =>
        this.pricing.hasConflictingCosts({
          costs: rulesSet.costs,
          maxNumber: skills.length,
        }),
      )
    ) {
      return { kind: 'disagree' };
    }
    const fixed = input.fixed ?? [];
    if (!this.applicable(fixed, skills)) {
      return { kind: 'none' };
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
      if (
        outcome.kind !== 'priced' ||
        outcome.total !== input.spent ||
        !this.honours({ fixed, steps, stepCosts: outcome.stepCosts })
      ) {
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

  /** Whether each fixed report names one distinct gained skill, with no variant. */
  private applicable(
    fixed: readonly SnapshotStep[],
    skills: readonly CategorisedSkill[],
  ): boolean {
    const ids = new Set(fixed.map((report) => report.skillId));
    return (
      fixed.length <= skills.length &&
      ids.size === fixed.length &&
      fixed.every(
        (report) =>
          report.attributeValue === null &&
          skills.some((skill) => skill.skillId === report.skillId),
      )
    );
  }

  /**
   * Whether each fixed report's skill sits where its selection, category and
   * shown cost put it, and the reports sit in the order they were given.
   */
  private honours(parts: {
    fixed: readonly SnapshotStep[];
    steps: readonly SnapshotStep[];
    stepCosts: readonly number[];
  }): boolean {
    let previous = -1;
    for (const report of parts.fixed) {
      const at = parts.steps.findIndex(
        (step) => step.skillId === report.skillId,
      );
      if (at === -1 || at <= previous) {
        return false;
      }
      previous = at;
      const step = parts.steps[at];
      if (
        step.selection !== report.selection ||
        step.category !== report.category ||
        parts.stepCosts[at] !== report.reportedCost
      ) {
        return false;
      }
    }
    return true;
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
