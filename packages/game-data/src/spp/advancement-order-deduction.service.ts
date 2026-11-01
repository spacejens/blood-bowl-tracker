import { Injectable } from '@nestjs/common';

import { AdvancementKindCandidatesService } from './advancement-kind-candidates.service';
import { AdvancementSpendRangeService } from './advancement-spend-range.service';
import type {
  AdvancementCandidatesInput,
  RulesSetAdvancementInput,
} from './unspent-spp.types';

/** The most new advancements whose orders are searched: 6! = 720 assignments. */
const MAX_DEDUCED = 6;

/** One way to give the new rows their numbers: row id -> advancement number. */
type Assignment = Map<number, number>;

/** What {@link AdvancementOrderDeductionService.deduce} works from. */
export interface DeduceAdvancementOrderInput {
  /** The player's advancement inputs, one per rules set of the era, read after the new rows were written. */
  rulesSets: RulesSetAdvancementInput[];
  /** Ids of the new rows, in the order to fall back on when order does not change cost. */
  newRowIds: number[];
  /** The advancement number the first new row can take: the count of the player's other paid advancements plus one. */
  firstNumber: number;
  /** The SPP the source reports as spent: its total minus its unspent figure. */
  spent: number;
}

/**
 * Works out the order of several advancements a player gained at once from
 * the SPP the source says they spent. Every assignment of the numbers
 * `firstNumber`, `firstNumber + 1`, ... to the new rows is pinned in turn and
 * priced; an assignment fits when, under some rules set of the era, the
 * player's advancements can cost exactly the reported spend. One fitting
 * assignment is the answer. Several fitting assignments that give the same
 * spend ranges under every rules set mean the order does not change cost, and
 * the fallback order (`newRowIds` as listed) is the answer when it fits.
 * Anything else has no single answer.
 *
 * The numbers count paid advancements only (gained skills and characteristic
 * increases, never starting skills or free extras), the numbering the cost
 * rows use.
 *
 * Pure decision logic over pure collaborators: no I/O and no state.
 */
@Injectable()
export class AdvancementOrderDeductionService {
  constructor(
    private readonly candidates: AdvancementKindCandidatesService,
    private readonly spendRange: AdvancementSpendRangeService,
  ) {}

  /** Row id -> advancement number, or undefined when no single order is known. */
  deduce(input: DeduceAdvancementOrderInput): Map<number, number> | undefined {
    const { newRowIds, firstNumber } = input;
    if (newRowIds.length < 2 || newRowIds.length > MAX_DEDUCED) {
      return undefined;
    }
    const numbers = newRowIds.map((_id, at) => firstNumber + at);
    const fitting = this.permutations(numbers)
      .map(
        (order): Assignment =>
          new Map(newRowIds.map((id, at) => [id, order[at]])),
      )
      .filter((assignment) => this.fits(input, assignment));
    if (fitting.length === 0) {
      return undefined;
    }
    if (fitting.length === 1) {
      return fitting[0];
    }
    const signatures = new Set(
      fitting.map((assignment) => this.signature(input, assignment)),
    );
    const fallback = fitting.find((assignment) =>
      newRowIds.every((id, at) => assignment.get(id) === firstNumber + at),
    );
    return signatures.size === 1 ? fallback : undefined;
  }

  /** Whether some rules set prices the pinned history at exactly the spend. */
  private fits(
    input: DeduceAdvancementOrderInput,
    assignment: Assignment,
  ): boolean {
    return input.rulesSets.some((rulesSet) =>
      this.spendRange.canSpendExactly(
        this.candidates.candidates(this.pinned(rulesSet, assignment)),
        rulesSet.costs,
        input.spent,
      ),
    );
  }

  /** The spend ranges under every rules set, as one comparable string. */
  private signature(
    input: DeduceAdvancementOrderInput,
    assignment: Assignment,
  ): string {
    return JSON.stringify(
      input.rulesSets.map((rulesSet) =>
        this.spendRange.range(
          this.candidates.candidates(this.pinned(rulesSet, assignment)),
          rulesSet.costs,
        ),
      ),
    );
  }

  /** The rules set's candidates input with the new rows confirmed at their numbers. */
  private pinned(
    rulesSet: RulesSetAdvancementInput,
    assignment: Assignment,
  ): AdvancementCandidatesInput {
    return {
      ...rulesSet.candidatesInput,
      skills: rulesSet.candidatesInput.skills.map((entry) => {
        const number = assignment.get(entry.id);
        return number === undefined
          ? entry
          : { ...entry, advancementOrder: number, orderConfirmed: true };
      }),
    };
  }

  /** Every ordering of `values`. */
  private permutations(values: number[]): number[][] {
    if (values.length <= 1) {
      return [values];
    }
    return values.flatMap((value, at) =>
      this.permutations([...values.slice(0, at), ...values.slice(at + 1)]).map(
        (rest) => [value, ...rest],
      ),
    );
  }
}
