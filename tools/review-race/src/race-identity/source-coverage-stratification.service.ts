import type { Db } from '@blood-bowl-tracker/db';
import { DB, raceExternalIds, races } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { ManualEntryMatcherService } from '../shared/manual-entry-matcher.service';
import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import type {
  RaceStratifier,
  StratumSampleRequest,
} from '../shared/race-stratifier';
import type { ReviewRace, ReviewStratum } from '../shared/review.types';
import { ManualRawDataService } from '../source/manual-raw-data.service';

const NO_BBL = 'no-bbl';
const NO_TP = 'no-tp';
const NO_MANUAL = 'no-manual';

/**
 * Races one source knows nothing about. These are exactly the races whose
 * imported record rests on a single source's word — a Stunty Leeg race BBL
 * and the curated files carry but TP never saw, or a race that only exists in
 * TP — so a mistake in that one source has nothing to contradict it.
 *
 * Each stratum is scoped to the one source it asks about, so the sampler
 * calls it once rather than three times with the same answer.
 */
@Injectable()
export class SourceCoverageStratificationService implements RaceStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    { id: NO_BBL, label: 'Race has no BBL data', sources: ['bbl'] },
    { id: NO_TP, label: 'Race has no TP data', sources: ['tp'] },
    {
      id: NO_MANUAL,
      label: 'Race has no manual curation entry',
      sources: ['manual'],
    },
  ];

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalSystems: ExternalSystemLookupService,
    private readonly manual: ManualRawDataService,
    private readonly raceIds: RaceExternalIdsService,
    private readonly matcher: ManualEntryMatcherService,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum(request: StratumSampleRequest): Promise<ReviewRace[]> {
    if (request.stratumId === NO_MANUAL) {
      return await this.withoutManualEntry(request.limit);
    }
    if (request.stratumId !== NO_BBL && request.stratumId !== NO_TP) {
      throw new Error(
        `Unknown race stratum "${request.stratumId}". Known strata: ` +
          `${NO_BBL}, ${NO_TP}, ${NO_MANUAL}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(
      request.source,
    );
    return await this.db
      .select({ raceId: races.id, raceName: races.name })
      .from(races)
      .leftJoin(
        raceExternalIds,
        and(
          eq(raceExternalIds.raceId, races.id),
          eq(raceExternalIds.externalSystemId, externalSystemId),
        ),
      )
      .where(isNull(raceExternalIds.id))
      .orderBy(sql`random()`)
      .limit(request.limit);
  }

  /**
   * "Has no manual entry" is answered against the curated files themselves,
   * using the same name-or-external-id rule every other raw panel uses (see
   * `ManualEntryMatcherService`): every race in random order is checked
   * against every curated `races[]` entry, stopping once `limit` races with
   * no match have been collected. Filtering after ordering (rather than in
   * SQL) keeps the sample random rather than alphabetical.
   */
  private async withoutManualEntry(limit: number): Promise<ReviewRace[]> {
    const curated = await this.manual.races();
    const candidates = await this.db
      .select({ raceId: races.id, raceName: races.name })
      .from(races)
      .orderBy(sql`random()`);
    const result: ReviewRace[] = [];
    for (const candidate of candidates) {
      if (result.length >= limit) {
        break;
      }
      const owned = await this.raceIds.allForRace(candidate.raceId);
      const hasManualEntry = curated.some((entry) =>
        this.matcher.matchesRace(entry, candidate.raceName, owned),
      );
      if (!hasManualEntry) {
        result.push(candidate);
      }
    }
    return result;
  }
}
