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
 * Prices a player's gained advancements against a cost table when neither
 * their order nor their kind is fully known.
 *
 * Each advancement comes with the options it could have been. Over every way
 * to give the N advancements the distinct numbers 1..N, and each advancement
 * one of its options that is priced at its number, `range` returns the least
 * and the most the whole set can have cost.
 */
@Injectable()
export class AdvancementSpendRangeService {
  /**
   * The least and most the advancements can have cost, or null when no
   * assignment fits the costs at all, meaning the recorded history does not
   * fit this cost table.
   */
  range(
    options: AdvancementOption[][],
    costs: ApplicableAdvancementCost[],
  ): SpendRange | null {
    const count = options.length;
    for (
      let advancementNumber = 1;
      advancementNumber <= count;
      advancementNumber++
    ) {
      if (!costs.some((cost) => cost.advancementNumber === advancementNumber)) {
        return null;
      }
    }
    const spentMin = this.bestTotal(
      this.costMatrix(options, costs, (fitting) => Math.min(...fitting)),
      (candidate, best) => candidate < best,
    );
    const spentMax = this.bestTotal(
      this.costMatrix(options, costs, (fitting) => Math.max(...fitting)),
      (candidate, best) => candidate > best,
    );
    return spentMin === null || spentMax === null
      ? null
      : { spentMin, spentMax };
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
   * `matrix[i][n - 1]` is what advancement `i` costs as advancement number
   * `n`, picked from the costs of its options priced at `n`, or null when
   * none of its options is.
   */
  private costMatrix(
    options: AdvancementOption[][],
    costs: ApplicableAdvancementCost[],
    pick: CostPicker,
  ): (number | null)[][] {
    return options.map((advancementOptions) => {
      const row: (number | null)[] = [];
      for (
        let advancementNumber = 1;
        advancementNumber <= options.length;
        advancementNumber++
      ) {
        const fitting = costs
          .filter(
            (cost) =>
              cost.advancementNumber === advancementNumber &&
              advancementOptions.some((option) => this.fits(option, cost)),
          )
          .map((cost) => cost.sppCost);
        row.push(fitting.length === 0 ? null : pick(fitting));
      }
      return row;
    });
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
