import { Injectable } from '@nestjs/common';

import type {
  AdvancementOption,
  ApplicableAdvancementCost,
  SpendRange,
} from './unspent-spp.types';

/** Picks one cost out of several that fit the same advancement and number. */
type CostPicker = (costs: number[]) => number;

/** Says whether a candidate total beats the best total found so far. */
type TotalComparer = (candidate: number, best: number) => boolean;

/**
 * The most advancements `range` prices. The search holds the numbers used so
 * far as a bitmask, so its table doubles with every advancement and a 32-bit
 * mask overflows at 32. No rules set prices anywhere near this many, and a
 * history longer than this is reported as not fitting rather than searched.
 */
const MAX_ADVANCEMENTS = 16;

/**
 * Prices a player's gained advancements against a cost table when neither
 * their order nor their kind is fully known.
 *
 * Each advancement comes with the options it could have been. Over every way
 * to give the N advancements the distinct numbers 1..N, and each advancement
 * one of its options that is priced at its number, `range` returns the least
 * and the most the whole set can have cost. `canSpendExactly` asks the same
 * search whether one exact total is reachable.
 */
@Injectable()
export class AdvancementSpendRangeService {
  /**
   * The least and most the advancements can have cost, or null when no
   * assignment fits the costs at all, meaning the recorded history does not
   * fit this cost table, or when there are more advancements than
   * {@link MAX_ADVANCEMENTS}.
   */
  range(
    options: AdvancementOption[][],
    costs: ApplicableAdvancementCost[],
  ): SpendRange | null {
    if (!this.priceable(options.length, costs)) {
      return null;
    }
    const choices = this.costChoices(options, costs);
    const spentMin = this.bestTotal(
      this.pickEach(choices, (fitting) => Math.min(...fitting)),
      (candidate, best) => candidate < best,
    );
    const spentMax = this.bestTotal(
      this.pickEach(choices, (fitting) => Math.max(...fitting)),
      (candidate, best) => candidate > best,
    );
    return spentMin === null || spentMax === null
      ? null
      : { spentMin, spentMax };
  }

  /**
   * Whether some way to give the advancements the distinct numbers 1..N,
   * and each one an option priced at its number, costs exactly `spent`.
   * False wherever `range` returns null. The same dynamic programme as
   * `bestTotal`, keeping every reachable total instead of the best one;
   * totals above `spent` are dropped, which is sound because every cost is
   * positive.
   */
  canSpendExactly(
    options: AdvancementOption[][],
    costs: ApplicableAdvancementCost[],
    spent: number,
  ): boolean {
    const count = options.length;
    if (!this.priceable(count, costs)) {
      return false;
    }
    const choices = this.costChoices(options, costs);
    const full = (1 << count) - 1;
    const reachable = new Map<number, Set<number>>([[0, new Set([0])]]);
    for (let used = 0; used < full; used++) {
      const totals = reachable.get(used);
      if (totals === undefined) {
        continue;
      }
      const row = choices[this.bitCount(used)];
      for (let slot = 0; slot < count; slot++) {
        if ((used & (1 << slot)) !== 0) {
          continue;
        }
        const next = used | (1 << slot);
        const nextTotals = reachable.get(next) ?? new Set<number>();
        for (const total of totals) {
          for (const cost of row[slot]) {
            if (total + cost <= spent) {
              nextTotals.add(total + cost);
            }
          }
        }
        if (nextTotals.size > 0) {
          reachable.set(next, nextTotals);
        }
      }
    }
    return reachable.get(full)?.has(spent) ?? false;
  }

  /**
   * The cheapest cost of any kind at this advancement number, or null when
   * the table has none.
   */
  cheapestCostAt(
    costs: ApplicableAdvancementCost[],
    advancementNumber: number,
  ): number | null {
    const matching = costs
      .filter((cost) => cost.advancementNumber === advancementNumber)
      .map((cost) => cost.sppCost);
    return matching.length === 0 ? null : Math.min(...matching);
  }

  /**
   * Whether `count` advancements can be searched at all: no more than
   * {@link MAX_ADVANCEMENTS}, and every number up to `count` priced.
   */
  private priceable(
    count: number,
    costs: ApplicableAdvancementCost[],
  ): boolean {
    if (count > MAX_ADVANCEMENTS) {
      return false;
    }
    for (
      let advancementNumber = 1;
      advancementNumber <= count;
      advancementNumber++
    ) {
      if (!costs.some((cost) => cost.advancementNumber === advancementNumber)) {
        return false;
      }
    }
    return true;
  }

  /**
   * `choices[i][n - 1]` is every cost advancement `i` could have as
   * advancement number `n`, from its options priced at `n`; empty when none
   * of its options is.
   */
  private costChoices(
    options: AdvancementOption[][],
    costs: ApplicableAdvancementCost[],
  ): number[][][] {
    return options.map((advancementOptions) => {
      const row: number[][] = [];
      for (
        let advancementNumber = 1;
        advancementNumber <= options.length;
        advancementNumber++
      ) {
        row.push(
          costs
            .filter(
              (cost) =>
                cost.advancementNumber === advancementNumber &&
                advancementOptions.some((option) => this.fits(option, cost)),
            )
            .map((cost) => cost.sppCost),
        );
      }
      return row;
    });
  }

  /**
   * `matrix[i][n - 1]` is the one cost `pick` takes from `choices[i][n - 1]`,
   * or null when there is none to pick from.
   */
  private pickEach(
    choices: number[][][],
    pick: CostPicker,
  ): (number | null)[][] {
    return choices.map((row) =>
      row.map((fitting) => (fitting.length === 0 ? null : pick(fitting))),
    );
  }

  private fits(
    option: AdvancementOption,
    cost: ApplicableAdvancementCost,
  ): boolean {
    return (
      option.advancementKind === cost.advancementKind &&
      (option.advancementNumber === null ||
        option.advancementNumber === cost.advancementNumber)
    );
  }

  /**
   * The best total over every way to give each advancement its own number: a
   * dynamic programme over the set of numbers used so far, held as a bitmask.
   * Advancements are placed in list order, so the count of used numbers says
   * which advancement comes next. The table has 2^N entries; `range` has
   * already checked that every number up to N is priced, so N never exceeds
   * the highest advancement number in the cost table.
   */
  private bestTotal(
    matrix: (number | null)[][],
    better: TotalComparer,
  ): number | null {
    const count = matrix.length;
    const full = (1 << count) - 1;
    const best = new Map<number, number>([[0, 0]]);
    for (let used = 0; used < full; used++) {
      const total = best.get(used);
      if (total === undefined) {
        continue;
      }
      const row = matrix[this.bitCount(used)];
      for (let slot = 0; slot < count; slot++) {
        const cost = row[slot];
        if ((used & (1 << slot)) !== 0 || cost === null) {
          continue;
        }
        const next = used | (1 << slot);
        const current = best.get(next);
        if (current === undefined || better(total + cost, current)) {
          best.set(next, total + cost);
        }
      }
    }
    return best.get(full) ?? null;
  }

  private bitCount(value: number): number {
    let count = 0;
    for (let rest = value; rest !== 0; rest &= rest - 1) {
      count++;
    }
    return count;
  }
}
