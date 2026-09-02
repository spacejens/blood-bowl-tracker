import type { ReviewSampler } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import type { RaceStratifier } from '../shared/race-stratifier';
import { RACE_STRATIFIERS } from '../shared/race-stratifier';
import type {
  ReviewGap,
  ReviewRace,
  SampledRace,
} from '../shared/review.types';
import { REVIEW_SOURCES } from '../shared/review.types';
import { RaceLookupService } from './race-lookup.service';

export interface SampleResult {
  items: SampledRace[];
  /** Strata and overrides that produced nothing — reported, never fatal. */
  gaps: ReviewGap[];
}

const OVERRIDE_REASON = 'override';

/**
 * Decides which races the report covers: every registered stratifier's strata
 * plus the config's pinned overrides, deduplicated by race id.
 *
 * Keyed on the race id alone — unlike review-player, which keys on
 * `source:playerId`. A race is one entity across BBL, TP and the curated
 * files, and its report entry shows all three side by side, so a stratum that
 * declares several sources for one race-level question resolves to the same
 * race and collapses into a single entry carrying one reason.
 *
 * Each stratum is sampled exactly once, using the first source it declares —
 * never once per declared source. Every current stratifier either declares
 * exactly one source (the per-source coverage strata), for which this is no
 * different from the old per-source loop, or declares several sources purely
 * as a formality because its query doesn't vary by source at all (era
 * availability, characteristics change, name mismatch, the random baseline).
 * For those, calling `sampleStratum` once per declared source used to run the
 * same `ORDER BY random() LIMIT n` query two or three independent times,
 * each drawing a different random sample — so a stratum configured for 3
 * races per source could select up to 9 distinct races instead of 3. Sampling
 * once removes that over-selection outright, and removes the need to
 * deduplicate the once-multiplied gaps this used to also produce.
 */
@Injectable()
export class RaceSamplerService implements ReviewSampler<SampledRace> {
  constructor(
    @Inject(RACE_STRATIFIERS)
    private readonly stratifiers: RaceStratifier[],
    private readonly lookup: RaceLookupService,
    private readonly config: RaceReviewConfigService,
  ) {}

  async sample(): Promise<SampleResult> {
    const limit = this.config.getRacesPerStratum();
    const selected = new Map<number, SampledRace>();
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
            reason: `No race found for stratum "${stratum.label}"`,
          });
          continue;
        }
        for (const race of found) {
          this.merge(selected, race, stratum.label);
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
            `Only ${found.length} of ${overrides.length} override race(s) ` +
            `were found in the database: ${overrides.join(', ')}`,
        });
      }
      for (const race of found) {
        this.merge(selected, race, OVERRIDE_REASON);
      }
    }

    return {
      items: [...selected.values()].sort((a, b) => this.compare(a, b)),
      gaps,
    };
  }

  /** Add a race, or add one more reason to a race already selected. */
  private merge(
    selected: Map<number, SampledRace>,
    race: ReviewRace,
    reason: string,
  ): void {
    const existing = selected.get(race.raceId);
    if (existing === undefined) {
      selected.set(race.raceId, { ...race, selectedFor: [reason] });
      return;
    }
    if (!existing.selectedFor.includes(reason)) {
      existing.selectedFor.push(reason);
    }
  }

  /** Stable report order: race name, then id. */
  private compare(a: SampledRace, b: SampledRace): number {
    if (a.raceName !== b.raceName) {
      return a.raceName < b.raceName ? -1 : 1;
    }
    return a.raceId - b.raceId;
  }
}
