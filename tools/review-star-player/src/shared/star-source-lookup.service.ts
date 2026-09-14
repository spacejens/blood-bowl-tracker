import { Injectable } from '@nestjs/common';

import type { BblRawStarPlayer } from '../source/bbl-raw-star-player-page.service';
import { BblRawStarPlayerPageService } from '../source/bbl-raw-star-player-page.service';
import type { TpRawStarPlayer } from '../source/tp-raw-star-player-index.service';
import { TpRawStarPlayerIndexService } from '../source/tp-raw-star-player-index.service';
import type { SampledStarPlayer } from './review.types';
import { StarPlayerExternalIdsService } from './star-player-external-ids.service';

/** BBL's page for a star, plus enough context to explain a miss. */
export interface BblStarLookup {
  star: BblRawStarPlayer | null;
  /** Only meaningful when `star` is null: why no page was found. */
  notFoundNote: string;
}

/** TP's entries for a star, plus enough context to explain a miss. */
export interface TpStarsLookup {
  stars: TpRawStarPlayer[];
  /** Only meaningful when `stars` is empty: why no entry was found. */
  notFoundNote: string;
}

/**
 * Resolves a sampled star to BBL's and TP's own raw entries for it — the
 * same ~25-line typID/spelling resolution every raw renderer
 * (identity/characteristics/hire-eligibility) needs, extracted once so it
 * exists in exactly one place. Also carries a ready-to-render explanation for
 * the "this source has nothing for this star" case, so every renderer shows
 * that absence the same way instead of silently omitting the sub-section (a
 * star sampled by the `no-bbl` stratum specifically because it has no BBL
 * data must not look identical to a bug).
 */
@Injectable()
export class StarSourceLookupService {
  constructor(
    private readonly externalIds: StarPlayerExternalIdsService,
    private readonly bbl: BblRawStarPlayerPageService,
    private readonly tp: TpRawStarPlayerIndexService,
  ) {}

  /**
   * BBL's page for this star. The typID recovered from its external ids is
   * tried first; a star whose BBL page listed no races carries no BBL id at
   * all, so the stored name is looked up against the mirror sweep instead.
   */
  async bblStarFor(star: SampledStarPlayer): Promise<BblStarLookup> {
    const typIds = await this.externalIds.bblTypIdsFor(star.positionId);
    for (const typId of typIds) {
      const found = await this.bbl.starFor(typId);
      if (found !== null) {
        return { star: found, notFoundNote: '' };
      }
    }
    const byName = await this.bbl.starForName(star.positionName);
    return {
      star: byName,
      notFoundNote:
        typIds.length === 0
          ? `no BBL page found for "${star.positionName}" (no BBL typID recorded)`
          : `no BBL page found for typID(s) ${typIds.join(', ')}`,
    };
  }

  /** TP's entries, one per TP spelling the star's external ids carry. */
  async tpStarsFor(star: SampledStarPlayer): Promise<TpStarsLookup> {
    const ids = await this.externalIds.forPosition(star.positionId);
    const spellings = [...new Set([...ids.tp, star.positionName])];
    const found: TpRawStarPlayer[] = [];
    for (const spelling of spellings) {
      const tpStar = await this.tp.starFor(spelling);
      if (tpStar !== null && !found.some((one) => one.name === tpStar.name)) {
        found.push(tpStar);
      }
    }
    return {
      stars: found,
      notFoundNote: `no TP entry found for spelling(s) ${spellings.join(', ')}`,
    };
  }
}
