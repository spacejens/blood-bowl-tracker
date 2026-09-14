import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  isNull,
  positionExternalIds,
  positions,
  sql,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type { ReviewStarPlayer, ReviewStratum } from '../shared/review.types';
import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import type {
  StarPlayerStratifier,
  StratumSampleRequest,
} from '../shared/star-player-stratifier';
import { ManualRawDataService } from '../source/manual-raw-data.service';

const NO_BBL = 'no-bbl';
const NO_TP = 'no-tp';
const NO_MANUAL = 'no-manual';

/**
 * Star players one source knows nothing about — exactly the stars whose
 * imported record rests on a single source's word, so a mistake in that one
 * source has nothing to contradict it. BBL only ever registered the stars
 * actually hired in the league, and TP publishes the whole official catalog,
 * so both directions genuinely occur.
 *
 * Each stratum is scoped to the one source it asks about, so the sampler
 * calls it once rather than three times with the same answer.
 */
@Injectable()
export class SourceCoverageStratificationService implements StarPlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    { id: NO_BBL, label: 'Star player has no BBL data', sources: ['bbl'] },
    { id: NO_TP, label: 'Star player has no TP data', sources: ['tp'] },
    {
      id: NO_MANUAL,
      label: 'Star player has no manual curation entry',
      sources: ['manual'],
    },
  ];

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalSystems: ExternalSystemLookupService,
    private readonly manual: ManualRawDataService,
    private readonly starIds: StarPlayerExternalIdsService,
    private readonly names: StarPlayerNameMatcherService,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum(
    request: StratumSampleRequest,
  ): Promise<ReviewStarPlayer[]> {
    if (request.stratumId === NO_MANUAL) {
      return await this.withoutManualEntry(request.limit);
    }
    if (request.stratumId !== NO_BBL && request.stratumId !== NO_TP) {
      throw new Error(
        `Unknown star player stratum "${request.stratumId}". Known strata: ` +
          `${NO_BBL}, ${NO_TP}, ${NO_MANUAL}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(
      request.source,
    );
    return await this.db
      .select({ positionId: positions.id, positionName: positions.name })
      .from(positions)
      .leftJoin(
        positionExternalIds,
        and(
          eq(positionExternalIds.positionId, positions.id),
          eq(positionExternalIds.externalSystemId, externalSystemId),
        ),
      )
      .where(
        and(eq(positions.isStarPlayer, true), isNull(positionExternalIds.id)),
      )
      .orderBy(sql`random()`)
      .limit(request.limit);
  }

  /**
   * "Has no curated entry" is answered against `star-players.json5` itself,
   * using the same name-or-external-id rule the raw panel uses: every star in
   * random order is checked against every curated entry, stopping once
   * `limit` unmatched stars have been collected. Filtering after ordering
   * (rather than in SQL) keeps the sample random rather than alphabetical.
   */
  private async withoutManualEntry(limit: number): Promise<ReviewStarPlayer[]> {
    const curated = await this.manual.starPlayers();
    const candidates = await this.db
      .select({ positionId: positions.id, positionName: positions.name })
      .from(positions)
      .where(eq(positions.isStarPlayer, true))
      .orderBy(sql`random()`);
    const result: ReviewStarPlayer[] = [];
    for (const candidate of candidates) {
      if (result.length >= limit) {
        break;
      }
      const owned = await this.starIds.allForPosition(candidate.positionId);
      const curatedEntry = curated.some(
        (entry) =>
          this.names.matchesName(entry.name, candidate.positionName) ||
          entry.externalIds.some((ref) => this.names.refMatches(ref, owned)),
      );
      if (!curatedEntry) {
        result.push(candidate);
      }
    }
    return result;
  }
}
