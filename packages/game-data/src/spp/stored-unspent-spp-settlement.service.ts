import { Injectable } from '@nestjs/common';

import type { CoversAnother, KnownUnspentSpp } from './unspent-spp.types';

/** The stored figure, and what settling the range against it needs. */
export interface StoredFigure {
  /** `players.unspent_spp`; null when nothing is stored. */
  stored: number | null;
  /** Each fitting rules set's own cheapest next cost. */
  nextCosts: (number | null)[];
}

/**
 * Settles a modelled unspent range against the stored figure. A stored
 * figure inside the range is exact, so the range narrows to it and the
 * verdict is worked out again from that one value, per rules set. One
 * outside the range is kept apart: the range stays and the result is
 * flagged, since the model can be wrong where the source is not.
 */
@Injectable()
export class StoredUnspentSppSettlementService {
  settle(result: KnownUnspentSpp, figure: StoredFigure): KnownUnspentSpp {
    const { stored, nextCosts } = figure;
    if (stored === null) {
      return {
        ...result,
        storedVerdict: 'none_stored',
        storedUnspentSpp: null,
      };
    }
    if (stored < result.unspentMin || stored > result.unspentMax) {
      return {
        ...result,
        storedVerdict: 'outside_range',
        storedUnspentSpp: stored,
      };
    }
    return {
      ...result,
      spentMin: result.totalSpp - stored,
      spentMax: result.totalSpp - stored,
      unspentMin: stored,
      unspentMax: stored,
      coversAnother: this.verdict(stored, nextCosts),
      storedVerdict: 'settled',
      storedUnspentSpp: stored,
    };
  }

  /** `yes` or `no` only when every rules set says so, otherwise `maybe`. */
  private verdict(stored: number, nextCosts: (number | null)[]): CoversAnother {
    const verdicts = nextCosts.map((cost): CoversAnother =>
      cost !== null && stored >= cost ? 'yes' : 'no',
    );
    if (verdicts.length === 0) {
      return 'no';
    }
    const [first] = verdicts;
    return verdicts.every((verdict) => verdict === first) ? first : 'maybe';
  }
}
