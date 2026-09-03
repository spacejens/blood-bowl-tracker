import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eraRulesSets,
  raceEras,
  races,
  rulesSets,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { eq, sql } from 'drizzle-orm';

import type {
  RaceStratifier,
  StratumSampleRequest,
} from '../shared/race-stratifier';
import type { ReviewRace, ReviewStratum } from '../shared/review.types';

const LEGACY_ONLY = 'legacy-only';
const MODERN_ONLY = 'modern-only';

/**
 * Races at the two ends of the rules-set timeline, which is where the
 * curation this tool exists to check is thinnest: a race that stopped being
 * playable before the modern rules sets (so only hand-curated CRP/CRP+/BB2016
 * characteristics exist for it), and a race introduced only under them (so no
 * curated older data should exist for it at all).
 *
 * "Modern" is the data's own distinction rather than a hard-coded rules-set
 * name list: a modern rules set is one whose `passing_format` is not
 * 'absent'. BB2020, DB2021 and BB2025 have a Passing characteristic; CRP,
 * CRP+ and BB2016 do not.
 */
@Injectable()
export class EraAvailabilityStratificationService implements RaceStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: LEGACY_ONLY,
      label: 'Race no longer available under modern rules sets',
      sources: ['bbl', 'tp', 'manual'],
    },
    {
      id: MODERN_ONLY,
      label: 'Race only available under modern rules sets',
      sources: ['bbl', 'tp', 'manual'],
    },
  ];

  constructor(@Inject(DB) private readonly db: Db) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewRace[]> {
    return await this.db
      .select({ raceId: races.id, raceName: races.name })
      .from(races)
      .innerJoin(raceEras, eq(raceEras.raceId, races.id))
      .innerJoin(eraRulesSets, eq(eraRulesSets.eraId, raceEras.eraId))
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .groupBy(races.id, races.name)
      .having(this.having(stratumId))
      .orderBy(sql`random()`)
      .limit(limit);
  }

  /** No modern rules set at all, or no legacy one at all. */
  private having(stratumId: string): SQL {
    if (stratumId === LEGACY_ONLY) {
      return sql`bool_or(${rulesSets.passingFormat} <> 'absent') = false`;
    }
    if (stratumId === MODERN_ONLY) {
      return sql`bool_or(${rulesSets.passingFormat} = 'absent') = false`;
    }
    throw new Error(
      `Unknown race stratum "${stratumId}". Known strata: ${LEGACY_ONLY}, ${MODERN_ONLY}.`,
    );
  }
}
