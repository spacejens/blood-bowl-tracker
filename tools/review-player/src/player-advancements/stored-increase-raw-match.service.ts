import { Injectable } from '@nestjs/common';

import type { StoredIncrease } from '../advancement-costs/advancement-cost-model.types';
import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import type { BblRawIncrease } from '../source/bbl-player-skills-cell.service';
import type { RawIncreaseMatch, RawVerdict } from './raw-match.types';

/**
 * Checks a BBL player's stored characteristic increases against the markers
 * on BBL's own page: an increase matches a marker of the same characteristic
 * at the same place among the player's advancements, which checks both how
 * many increases were stored and where they sit. An increase stored without
 * an order matches a leftover marker of the same characteristic and reads as
 * matched with its order unknown, not as a mismatch. Markers nothing stored
 * accounts for come back as raw-only.
 *
 * TP publishes no increase markers, so a TP player's increases are not
 * compared at all.
 */
@Injectable()
export class StoredIncreaseRawMatchService {
  constructor(private readonly bbl: BblPlayerAdvancementsReaderService) {}

  async match(
    player: SampledPlayer,
    increases: readonly StoredIncrease[],
  ): Promise<RawIncreaseMatch> {
    if (player.source !== 'bbl') {
      return this.all(increases, 'not compared');
    }
    const raw = await this.bbl.read(player.externalId);
    if (raw === null) {
      return this.all(increases, 'not read');
    }
    const markerOf = this.pair(increases, raw.increases);
    const matched = new Set(markerOf.values());
    return {
      verdicts: new Map(
        increases.map((increase, i) => [
          increase,
          this.verdict(increase, markerOf.has(i)),
        ]),
      ),
      rawOnly: raw.increases.filter((_, m) => !matched.has(m)),
    };
  }

  private verdict(increase: StoredIncrease, matched: boolean): RawVerdict {
    if (!matched) {
      return 'not in the raw source';
    }
    return increase.advancementOrder === null ? 'yes, order unknown' : 'yes';
  }

  private all(
    increases: readonly StoredIncrease[],
    verdict: RawVerdict,
  ): RawIncreaseMatch {
    return {
      verdicts: new Map(increases.map((increase) => [increase, verdict])),
      rawOnly: [],
    };
  }

  /**
   * Pairs stored rows with raw markers, returning each matched stored row's
   * index mapped to its marker's index. Rows with a stored order match a
   * marker of the same characteristic at the same order first; rows of
   * unknown order then match any leftover marker of the same characteristic,
   * since an order that was never recorded cannot disagree with BBL's.
   */
  private pair(
    stored: readonly StoredIncrease[],
    markers: readonly BblRawIncrease[],
  ): Map<number, number> {
    const markerOf = new Map<number, number>();
    const taken = new Set<number>();
    const take = (
      i: number,
      fits: (marker: BblRawIncrease) => boolean,
    ): void => {
      const m = markers.findIndex(
        (marker, index) => !taken.has(index) && fits(marker),
      );
      if (m !== -1) {
        taken.add(m);
        markerOf.set(i, m);
      }
    };
    stored.forEach((row, i) => {
      if (row.advancementOrder !== null) {
        take(
          i,
          (marker) =>
            marker.characteristic === row.characteristic &&
            marker.advancementOrder === row.advancementOrder,
        );
      }
    });
    stored.forEach((row, i) => {
      if (row.advancementOrder === null) {
        take(i, (marker) => marker.characteristic === row.characteristic);
      }
    });
    return markerOf;
  }
}
