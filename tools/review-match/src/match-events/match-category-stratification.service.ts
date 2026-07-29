import type { Db, Match } from '@blood-bowl-tracker/db';
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
import type {
  ReviewMatch,
  ReviewSource,
  ReviewStratum,
} from '../shared/review.types';

/**
 * Every non-normal `matches.category`, mapped to its stratum id and label.
 * `normal` gets no dedicated stratum: it's already the overwhelming majority
 * of matches and needs no deliberate inclusion.
 */
const CATEGORY_STRATA: readonly {
  id: string;
  category: Match['category'];
  label: string;
}[] = [
  { id: 'cup_final', category: 'cup_final', label: 'Cup final match' },
  {
    id: 'season_semi_final',
    category: 'season_semi_final',
    label: 'Season semi-final match',
  },
  {
    id: 'season_final',
    category: 'season_final',
    label: 'Season final match',
  },
  {
    id: 'season_bronze',
    category: 'season_bronze',
    label: 'Season bronze match',
  },
  {
    id: 'season_qualifier',
    category: 'season_qualifier',
    label: 'Season qualifier match',
  },
];

const CATEGORY_STRATUM_SOURCES: readonly ReviewSource[] = ['bbl', 'tp'];

/**
 * Picks database matches by their `matches.category`, one stratum per
 * non-normal category. Without this, no stratum ever deliberately pulled a
 * cup final or a season semi-final into a report — the existing strata only
 * select on match-event or merge properties.
 *
 * A separate stratifier rather than folding into
 * `MergedMatchStratificationService`: this filters a plain `matches` column
 * rather than that service's "how many external ids does this match have"
 * `HAVING` check. It still needs the same `GROUP BY` dedup as every other
 * stratifier here, though — a merged BBL match has two `matchExternalIds`
 * rows under one external system, and without grouping it would surface
 * twice.
 */
@Injectable()
export class MatchCategoryStratificationService implements MatchStratifier {
  private readonly strata: readonly ReviewStratum[] = CATEGORY_STRATA.map(
    ({ id, label }) => ({ id, label, sources: CATEGORY_STRATUM_SOURCES }),
  );

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
    const category = this.categoryFor(stratumId);
    const externalSystemId = await this.externalSystems.getSystemId(source);
    // GROUP BY, not a plain select: a merged BBL match (the four-team
    // finals) carries two matchExternalIds rows under the same external
    // system by design. Without this, such a match would surface as two
    // duplicate rows here — for the cup_final/season_final strata that's
    // exactly the case most likely to occur, and it would let one merged
    // match consume multiple of a stratum's sample slots. `array_agg`
    // (ordered numerically, not lexicographically) collects every external
    // id for the match rather than collapsing to just the lowest one, so a
    // merged match's second source page isn't silently dropped from the
    // report — matching `MergedMatchStratificationService`'s approach.
    const rows = await this.db
      .select({
        matchId: matches.id,
        externalIds: sql<
          string[]
        >`array_agg(${matchExternalIds.externalId} order by ${matchExternalIds.externalId}::integer)`,
        matchName: matches.name,
        competitionName: competitions.name,
        playedAt: matches.playedAt,
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
      .where(eq(matches.category, category))
      .groupBy(
        matches.id,
        matches.name,
        competitions.name,
        matches.playedAt,
        matches.category,
      )
      // Random, not newest-first: every stratum querying "the same handful
      // of most recent matches" would otherwise collapse a large sample
      // into a handful of overlapping matches, defeating the point of
      // sampling several strata in the first place.
      .orderBy(sql`random()`)
      .limit(limit);

    // Numerically ascending above, so the lower id is first — matching the
    // importer's own "primary = numerically lower id" convention.
    return rows.map(({ externalIds, ...row }) => ({
      source,
      category,
      ...row,
      externalId: externalIds[0],
      secondaryExternalId: externalIds[1],
    }));
  }

  /** The `matches.category` value one stratum id filters on. */
  private categoryFor(stratumId: string): Match['category'] {
    const found = CATEGORY_STRATA.find((entry) => entry.id === stratumId);
    if (!found) {
      throw new Error(
        `Unknown match-category stratum "${stratumId}". Known strata: ` +
          `${CATEGORY_STRATA.map((entry) => entry.id).join(', ')}.`,
      );
    }
    return found.category;
  }
}
