import type { Db } from '@blood-bowl-tracker/db';
import {
  competitions,
  DB,
  matches,
  matchExternalIds,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type { ReviewMatch, ReviewSource } from '../shared/review.types';

/**
 * Resolves config-pinned matches: the developer names a source's own match id
 * ("show me BBL match 1830 whatever the strata pick") and this finds the
 * database row behind it.
 */
@Injectable()
export class MatchLookupService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalSystems: ExternalSystemLookupService,
  ) {}

  async findByExternalIds(
    source: ReviewSource,
    externalIds: string[],
  ): Promise<ReviewMatch[]> {
    if (externalIds.length === 0) {
      return [];
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const rows = await this.db
      .select({
        matchId: matches.id,
        externalId: matchExternalIds.externalId,
        matchName: matches.name,
        competitionName: competitions.name,
        playedAt: matches.playedAt,
        category: matches.category,
      })
      .from(matchExternalIds)
      .innerJoin(matches, eq(matches.id, matchExternalIds.matchId))
      .innerJoin(competitions, eq(competitions.id, matches.competitionId))
      .where(
        and(
          eq(matchExternalIds.externalSystemId, externalSystemId),
          inArray(matchExternalIds.externalId, externalIds),
        ),
      );

    return rows.map((row) => ({ source, ...row }));
  }
}
