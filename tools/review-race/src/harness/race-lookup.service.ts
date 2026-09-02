import type { Db } from '@blood-bowl-tracker/db';
import { DB, raceExternalIds, races } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type { ReviewRace, ReviewSource } from '../shared/review.types';

/**
 * Resolves the config's pinned overrides to database races. BBL and TP
 * overrides are those sources' own external race ids; a manual override is
 * the race's own name, because the hand-curated data registers into the
 * BBL/TP/Name id spaces rather than one of its own — so that branch matches on
 * `races.name` instead of an external id. Strata do their own, wider queries.
 */
@Injectable()
export class RaceLookupService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalSystems: ExternalSystemLookupService,
  ) {}

  async findByExternalIds(
    source: ReviewSource,
    externalIds: string[],
  ): Promise<ReviewRace[]> {
    if (externalIds.length === 0) {
      return [];
    }
    if (source === 'manual') {
      return await this.findByNames(externalIds);
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    return await this.db
      .select({ raceId: races.id, raceName: races.name })
      .from(races)
      .innerJoin(
        raceExternalIds,
        and(
          eq(raceExternalIds.raceId, races.id),
          eq(raceExternalIds.externalSystemId, externalSystemId),
        ),
      )
      .where(inArray(raceExternalIds.externalId, externalIds));
  }

  private async findByNames(names: string[]): Promise<ReviewRace[]> {
    return await this.db
      .select({ raceId: races.id, raceName: races.name })
      .from(races)
      .where(
        inArray(
          sql`lower(${races.name})`,
          names.map((name) => name.toLowerCase()),
        ),
      );
  }
}
