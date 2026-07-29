import type { Db } from '@blood-bowl-tracker/db';
import {
  competitions,
  DB,
  matches,
  matchExternalIds,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

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
    const matchIdRows = await this.db
      .selectDistinct({ matchId: matchExternalIds.matchId })
      .from(matchExternalIds)
      .where(
        and(
          eq(matchExternalIds.externalSystemId, externalSystemId),
          inArray(matchExternalIds.externalId, externalIds),
        ),
      );
    if (matchIdRows.length === 0) {
      return [];
    }

    // Every external id under this system for each matched match, not just
    // the ones named in `externalIds` — a merged BBL match reached via only
    // one of its two source ids still needs its partner id so the raw-source
    // panel can render both source pages. Mirrors
    // `MergedMatchStratificationService`'s array_agg approach.
    const rows = await this.db
      .select({
        matchId: matches.id,
        matchName: matches.name,
        competitionName: competitions.name,
        playedAt: matches.playedAt,
        category: matches.category,
        externalIds: sql<
          string[]
        >`array_agg(${matchExternalIds.externalId} order by ${matchExternalIds.externalId}::integer)`,
      })
      .from(matches)
      .innerJoin(competitions, eq(competitions.id, matches.competitionId))
      .innerJoin(
        matchExternalIds,
        and(
          eq(matchExternalIds.matchId, matches.id),
          eq(matchExternalIds.externalSystemId, externalSystemId),
        ),
      )
      .where(
        inArray(
          matches.id,
          matchIdRows.map((row) => row.matchId),
        ),
      )
      .groupBy(
        matches.id,
        matches.name,
        competitions.name,
        matches.playedAt,
        matches.category,
      );

    return rows.map(({ externalIds: ids, ...row }) => ({
      source,
      ...row,
      externalId: ids[0],
      secondaryExternalId: ids[1],
    }));
  }
}
