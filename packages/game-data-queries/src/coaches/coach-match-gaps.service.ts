import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  coaches,
  DB,
  desc,
  eq,
  eras,
  isNotNull,
  matches,
  matchTeams,
  sql,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import { Inject, Injectable } from '@nestjs/common';

/**
 * The coach time-between-matches toplists: each coach's gaps between
 * consecutive in-scope matches, ranked by the single longest gap (either
 * direction) or by the average gap. Reached through `CoachesQueriesService`,
 * which delegates its `get*Gap*` methods here.
 */
@Injectable()
export class CoachMatchGapsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Per-coach consecutive-match gaps, as a subquery of
   * `{ coachId, name, gapDays }` rows — one row per match, with `gapDays` the
   * fractional number of days since that coach's previous match in scope, and
   * null for a coach's first match.
   *
   * The inner `selectDistinct` deduplicates a match a coach played with two of
   * their own teams (same reason `countMatchesPlayedByCoach` counts distinct
   * match ids), so such a match cannot produce a spurious zero-day gap. League,
   * era and match-category filtering is applied here, before the window function, so only
   * in-scope matches take part in a coach's gap sequence.
   */
  private gapsByCoach(scope: FactScope) {
    const coachMatches = this.db
      .selectDistinct({
        coachId: coaches.id,
        name: coaches.name,
        playedAt: matches.playedAt,
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(
        and(
          scope.leagueId === undefined
            ? undefined
            : eq(eras.leagueId, scope.leagueId),
          scope.eraId === undefined
            ? undefined
            : eq(teamEras.eraId, scope.eraId),
          scope.category === undefined
            ? undefined
            : eq(matches.category, scope.category),
        ),
      )
      .as('coach_matches');

    return this.db
      .select({
        coachId: coachMatches.coachId,
        name: coachMatches.name,
        gapDays: sql<
          number | null
        >`extract(epoch from ${coachMatches.playedAt} - lag(${coachMatches.playedAt}) over (partition by ${coachMatches.coachId} order by ${coachMatches.playedAt})) / 86400.0`.as(
          'gap_days',
        ),
      })
      .from(coachMatches)
      .as('coach_match_gaps');
  }

  /**
   * Coaches ranked by their single longest gap between consecutive matches,
   * rounded half-up to whole days. `direction` is the only difference between
   * the "longest gap" and "most consistent" toplists: they are the same metric
   * read from opposite ends.
   */
  private rankByLongestGap(
    scope: FactScope,
    limit: number,
    direction: 'asc' | 'desc',
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    const gaps = this.gapsByCoach(scope);
    // ::numeric before round() so PostgreSQL rounds half away from zero (gaps
    // are never negative, so that is round-half-up); ::int matches the count
    // shape LeaderboardService expects.
    const longest = sql<number>`round(max(${gaps.gapDays})::numeric)::int`;
    const query = this.db
      .select({ coachId: gaps.coachId, name: gaps.name, count: longest })
      .from(gaps)
      // A null gap is a coach's first match; dropping those also drops coaches
      // with fewer than two in-scope matches entirely.
      .where(isNotNull(gaps.gapDays))
      .groupBy(gaps.coachId, gaps.name);
    // "Most consistent" only means something with a real activity history, so
    // require 4 gaps (5 matches); "longest" deliberately has no floor, since
    // it wants a coach's single worst gap regardless of how few they've played.
    const filtered =
      direction === 'asc' ? query.having(sql`count(*) >= 4`) : query;
    return filtered
      .orderBy(direction === 'desc' ? desc(longest) : asc(longest))
      .limit(limit);
  }

  getGapBetweenMatchesByCoachDescending(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.rankByLongestGap(scope, limit, 'desc');
  }

  /**
   * The same longest-gap metric ascending: the coaches whose *worst* gap is
   * smallest, i.e. the most consistently active ones.
   */
  getGapBetweenMatchesByCoachAscending(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.rankByLongestGap(scope, limit, 'asc');
  }

  /**
   * Coaches ranked by the mean gap across all of their consecutive in-scope
   * matches, rounded half-up to whole days, smallest first.
   */
  getAverageGapBetweenMatchesByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    const gaps = this.gapsByCoach(scope);
    const average = sql<number>`round(avg(${gaps.gapDays})::numeric)::int`;
    return (
      this.db
        .select({ coachId: gaps.coachId, name: gaps.name, count: average })
        .from(gaps)
        .where(isNotNull(gaps.gapDays))
        .groupBy(gaps.coachId, gaps.name)
        // Same 4-gap (5-match) floor as the "most consistent" toplist, for the
        // same reason: an average over too few matches is not a meaningful signal.
        .having(sql`count(*) >= 4`)
        .orderBy(asc(average))
        .limit(limit)
    );
  }
}
