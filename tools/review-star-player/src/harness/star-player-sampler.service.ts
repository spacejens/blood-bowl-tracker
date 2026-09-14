import type { ReviewSampler } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';
import type {
  ReviewGap,
  ReviewStarPlayer,
  SampledStarPlayer,
} from '../shared/review.types';
import { REVIEW_SOURCES } from '../shared/review.types';
import type { StarPlayerStratifier } from '../shared/star-player-stratifier';
import { STAR_PLAYER_STRATIFIERS } from '../shared/star-player-stratifier';
import { StarPlayerLookupService } from './star-player-lookup.service';

export interface SampleResult {
  items: SampledStarPlayer[];
  /** Strata and overrides that produced nothing — reported, never fatal. */
  gaps: ReviewGap[];
}

const OVERRIDE_REASON = 'override';

/**
 * Decides which star players the report covers: every registered
 * stratifier's strata plus the config's pinned overrides, deduplicated by
 * position id.
 *
 * Keyed on `positionId` alone — a star player is one entity across BBL, TP
 * and the curated files, and its report entry shows all three side by side,
 * so two different strata that both select the same star collapse into a
 * single entry carrying both reasons, rather than appearing as two report
 * rows.
 *
 * Each stratum is sampled exactly once, using the first source it declares —
 * not once per source. A stratum that declares several sources purely as a
 * formality (its query doesn't vary by source) would otherwise multiply its
 * `ORDER BY random() LIMIT n` draws and over-select.
 */
@Injectable()
export class StarPlayerSamplerService implements ReviewSampler<SampledStarPlayer> {
  constructor(
    @Inject(STAR_PLAYER_STRATIFIERS)
    private readonly stratifiers: StarPlayerStratifier[],
    private readonly lookup: StarPlayerLookupService,
    private readonly config: StarPlayerReviewConfigService,
  ) {}

  async sample(): Promise<SampleResult> {
    const limit = this.config.getStarsPerStratum();
    const selected = new Map<number, SampledStarPlayer>();
    const gaps: ReviewGap[] = [];

    for (const stratifier of this.stratifiers) {
      for (const stratum of stratifier.listStrata()) {
        const source = stratum.sources[0];
        const found = await stratifier.sampleStratum({
          source,
          stratumId: stratum.id,
          limit,
        });
        if (found.length === 0) {
          gaps.push({
            source,
            reason: `No star player found for stratum "${stratum.label}"`,
          });
          continue;
        }
        for (const star of found) {
          this.merge(selected, star, stratum.label);
        }
      }
    }

    for (const source of REVIEW_SOURCES) {
      const overrides = this.config.getOverrides(source);
      if (overrides.length === 0) {
        continue;
      }
      const found = await this.lookup.findByExternalIds(source, overrides);
      if (found.length < overrides.length) {
        gaps.push({
          source,
          reason:
            `Only ${found.length} of ${overrides.length} override star player(s) ` +
            `were found in the database: ${overrides.join(', ')}`,
        });
      }
      for (const star of found) {
        this.merge(selected, star, OVERRIDE_REASON);
      }
    }

    return {
      items: [...selected.values()].sort((a, b) => this.compare(a, b)),
      gaps,
    };
  }

  /** Add a star player, or add one more reason to a star already selected. */
  private merge(
    selected: Map<number, SampledStarPlayer>,
    star: ReviewStarPlayer,
    reason: string,
  ): void {
    const existing = selected.get(star.positionId);
    if (existing === undefined) {
      selected.set(star.positionId, { ...star, selectedFor: [reason] });
      return;
    }
    if (!existing.selectedFor.includes(reason)) {
      existing.selectedFor.push(reason);
    }
  }

  /** Stable report order: star name, then position id. */
  private compare(a: SampledStarPlayer, b: SampledStarPlayer): number {
    if (a.positionName !== b.positionName) {
      return a.positionName < b.positionName ? -1 : 1;
    }
    return a.positionId - b.positionId;
  }
}
