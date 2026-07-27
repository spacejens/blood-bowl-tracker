import type { Db } from '@blood-bowl-tracker/db';
import {
  competitions,
  DB,
  matches,
  matchExternalIds,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type {
  MatchStratifier,
  StratumSampleRequest,
} from '../shared/match-stratifier';
import type { ReviewMatch, ReviewStratum } from '../shared/review.types';

const MERGED_STRATUM_ID = 'merged';

/**
 * Picks database matches the BBL importer built by merging two original BBL
 * two-team rows into one four-team match (the Bierhallentodball finals and
 * friends). That merge is an interpretation step like any other, so it gets
 * its own stratum.
 *
 * A separate stratifier rather than a seventh case in
 * `MatchEventStratificationService`: this queries `matches` grouped by match
 * and filtered on how many external ids it has, where all six of that
 * service's strata filter individual `match_events` rows.
 */
@Injectable()
export class MergedMatchStratificationService implements MatchStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: MERGED_STRATUM_ID,
      label: 'BBL four-team match merged from two source pages',
      sources: ['bbl'],
    },
  ];

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalSystems: ExternalSystemLookupService,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    source,
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewMatch[]> {
    if (stratumId !== MERGED_STRATUM_ID) {
      throw new Error(
        `Unknown merged-match stratum "${stratumId}". Known strata: ` +
          `${MERGED_STRATUM_ID}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    // Exactly two external ids for this source is the signal the BBL importer
    // leaves behind when it merges a pair: it pushes both original BBL ids
    // onto the primary match under the same external system.
    const rows = await this.db
      .select({
        matchId: matches.id,
        matchName: matches.name,
        competitionName: competitions.name,
        playedAt: matches.playedAt,
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
      .groupBy(matches.id, matches.name, competitions.name, matches.playedAt)
      .having(sql`count(*) = 2`)
      // Random for the same reason the other stratifier randomises: several
      // strata all taking "the newest few" would collapse into the same
      // handful of matches.
      .orderBy(sql`random()`)
      .limit(limit);

    // Numerically ascending above, so the lower id is first — matching the
    // importer's own "primary = numerically lower id" convention.
    return rows.map(({ externalIds, ...row }) => ({
      source,
      ...row,
      externalId: externalIds[0],
      secondaryExternalId: externalIds[1],
    }));
  }
}
