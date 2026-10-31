import { Injectable } from '@nestjs/common';

import type {
  CoversAnother,
  FittingOutcome,
  RulesSetOutcome,
  UnspentSppResult,
} from './unspent-spp.types';

/**
 * Merges what each rules set of a player's era makes of their history into
 * one unspent SPP result, and gives one rules set's verdict on whether the
 * unspent SPP covers the next advancement. Pure: UnspentSppService loads and
 * prices the history.
 */
@Injectable()
export class UnspentSppCombinationService {
  /**
   * The widest range over the rules sets whose costs fit: the lowest spend,
   * the highest spend and the lowest next cost. The verdict is each rules
   * set's own, merged: `yes` or `no` only when all of them say so, otherwise
   * `maybe`. Comparing the merged range against the merged next cost instead
   * would mix figures from different rules sets.
   */
  combine(totalSpp: number, outcomes: RulesSetOutcome[]): UnspentSppResult {
    const fits = outcomes.filter(
      (outcome): outcome is FittingOutcome => outcome.kind === 'fits',
    );
    if (fits.length === 0) {
      return {
        status: 'unknown',
        reason: outcomes.every((outcome) => outcome.kind === 'no_costs')
          ? 'no_costs'
          : 'inconsistent_history',
      };
    }
    const spentMin = Math.min(...fits.map((fit) => fit.spentMin));
    const spentMax = Math.max(...fits.map((fit) => fit.spentMax));
    const nextCosts = fits
      .map((fit) => fit.cheapestNextCost)
      .filter((cost): cost is number => cost !== null);
    const cheapestNextCost =
      nextCosts.length === 0 ? null : Math.min(...nextCosts);
    return {
      status: 'known',
      totalSpp,
      advancementsGained: fits[0].advancementsGained,
      spentMin,
      spentMax,
      unspentMin: totalSpp - spentMax,
      unspentMax: totalSpp - spentMin,
      cheapestNextCost,
      coversAnother: this.mergeVerdicts(fits.map((fit) => fit.coversAnother)),
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    };
  }

  /**
   * `no` when no further advancement exists or even the largest unspent
   * figure falls short, `yes` when even the smallest covers it.
   */
  coversAnother(
    unspentMin: number,
    unspentMax: number,
    cheapestNextCost: number | null,
  ): CoversAnother {
    if (cheapestNextCost === null || unspentMax < cheapestNextCost) {
      return 'no';
    }
    return unspentMin >= cheapestNextCost ? 'yes' : 'maybe';
  }

  private mergeVerdicts(verdicts: CoversAnother[]): CoversAnother {
    const [first] = verdicts;
    return verdicts.every((verdict) => verdict === first) ? first : 'maybe';
  }
}
