import { Inject, Injectable } from '@nestjs/common';

import { ReviewMatchConfigService } from '../config/review-match-config.service';
import type { MatchStratifier } from '../shared/match-stratifier';
import { MATCH_STRATIFIERS } from '../shared/match-stratifier';
import type {
  ReviewGap,
  ReviewMatch,
  SampledMatch,
} from '../shared/review.types';
import { REVIEW_SOURCES } from '../shared/review.types';
import { MatchLookupService } from './match-lookup.service';

export interface SampleResult {
  matches: SampledMatch[];
  /** Strata and overrides that produced nothing — reported, never fatal. */
  gaps: ReviewGap[];
}

const OVERRIDE_REASON = 'override';

/**
 * Decides which matches the report covers: every registered stratifier's
 * strata (a few matches each, per source) plus the config's pinned override
 * ids, deduplicated so a match picked several times is reported once with
 * every reason it was picked for.
 */
@Injectable()
export class MatchSamplerService {
  constructor(
    @Inject(MATCH_STRATIFIERS)
    private readonly stratifiers: MatchStratifier[],
    private readonly lookup: MatchLookupService,
    private readonly config: ReviewMatchConfigService,
  ) {}

  async sample(): Promise<SampleResult> {
    const limit = this.config.getMatchesPerStratum();
    const selected = new Map<string, SampledMatch>();
    const gaps: ReviewGap[] = [];

    for (const stratifier of this.stratifiers) {
      for (const stratum of stratifier.listStrata()) {
        for (const source of stratum.sources) {
          const found = await stratifier.sampleStratum({
            source,
            stratumId: stratum.id,
            limit,
          });
          if (found.length === 0) {
            gaps.push({
              source,
              reason: `No match found for stratum "${stratum.label}"`,
            });
            continue;
          }
          for (const match of found) {
            this.merge(selected, match, stratum.label);
          }
        }
      }
    }

    for (const source of REVIEW_SOURCES) {
      const overrides = this.config.getOverrides(source);
      if (overrides.length === 0) {
        continue;
      }
      const found = await this.lookup.findByExternalIds(source, overrides);
      // Both ids, not just the primary: an override naming a merged match's
      // secondary (higher) id resolves onto that match too — see
      // MatchLookupService — so it must not be reported as a gap.
      const foundIds = new Set(
        found.flatMap((match) =>
          match.secondaryExternalId === undefined
            ? [match.externalId]
            : [match.externalId, match.secondaryExternalId],
        ),
      );
      for (const externalId of overrides) {
        if (!foundIds.has(externalId)) {
          gaps.push({
            source,
            reason: `Override match "${externalId}" was not found in the database`,
          });
        }
      }
      for (const match of found) {
        this.merge(selected, match, OVERRIDE_REASON);
      }
    }

    return {
      matches: [...selected.values()].sort((a, b) => this.compare(a, b)),
      gaps,
    };
  }

  /** Add a match, or add one more reason to a match already selected. */
  private merge(
    selected: Map<string, SampledMatch>,
    match: ReviewMatch,
    reason: string,
  ): void {
    const key = `${match.source}:${match.matchId}`;
    const existing = selected.get(key);
    if (!existing) {
      selected.set(key, { ...match, selectedFor: [reason] });
      return;
    }
    if (!existing.selectedFor.includes(reason)) {
      existing.selectedFor.push(reason);
    }
    existing.secondaryExternalId ??= match.secondaryExternalId;
  }

  /** Stable report order: source, then oldest match first, then id. */
  private compare(a: SampledMatch, b: SampledMatch): number {
    if (a.source !== b.source) {
      return a.source < b.source ? -1 : 1;
    }
    const byDate = a.playedAt.getTime() - b.playedAt.getTime();
    return byDate !== 0 ? byDate : a.matchId - b.matchId;
  }
}
