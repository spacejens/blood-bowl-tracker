import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  coaches,
  competitions,
  competitionTeams,
  countDistinct,
  DB,
  desc,
  eq,
  eras,
  ilike,
  inArray,
  isNotNull,
  matches,
  matchTeams,
  sql,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import { FOUL_TYPES } from '@blood-bowl-tracker/game-data';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';
import { MatchEventCountsService } from '../shared/match-event-counts.service';
import { MatchOutcomeCountsService } from '../shared/match-outcome-counts.service';
import { TrophyAwardCountsService } from '../shared/trophy-award-counts.service';

/**
 * Read-only coach lookups, scoped counts and toplists for the Discord bot.
 * Coach ingestion is `CoachesService` in packages/game-data.
 */
@Injectable()
export class CoachesQueriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
    private readonly matchEventCounts: MatchEventCountsService,
    private readonly matchOutcomeCounts: MatchOutcomeCountsService,
    private readonly trophyAwardCounts: TrophyAwardCountsService,
  ) {}

  async findById(
    id: number,
  ): Promise<{ id: number; name: string } | undefined> {
    const rows = await this.db
      .select({ id: coaches.id, name: coaches.name })
      .from(coaches)
      .where(eq(coaches.id, id));
    return rows[0];
  }

  /**
   * Every era any of this coach's teams belongs to, oldest first. Joins through
   * `teams` rather than filtering `teamEras.teamId` directly (as the team-side
   * sibling `TeamsQueriesService.listEras` does) because a coach can own several
   * teams; `groupBy` then collapses an era that two of those teams share, which
   * would otherwise be listed twice.
   */
  async listEras(coachId: number): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: eras.id, name: eras.name })
      .from(teamEras)
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teams.coachId, coachId))
      .groupBy(eras.id, eras.name)
      .orderBy(eras.startDate, eras.name);
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: coaches.id, name: coaches.name })
      .from(coaches)
      .where(ilike(coaches.name, `${this.likePattern.escape(prefix)}%`))
      .limit(limit);
  }

  async getCareerSpan(
    coachId: number,
  ): Promise<{ start: string; end: string } | undefined> {
    // Aggregate over zero rows still returns one row with null start/end, so a
    // null start marks a coach who has recorded no matches. Each aggregate is
    // converted to a UTC calendar day (YYYY-MM-DD) after aggregating, so the
    // span does not depend on the database session's timezone and the resolver
    // can render the strings directly.
    const [row] = await this.db
      .select({
        start: sql<
          string | null
        >`(min(${matches.playedAt}) at time zone 'UTC')::date`,
        end: sql<
          string | null
        >`(max(${matches.playedAt}) at time zone 'UTC')::date`,
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teams.coachId, coachId));
    if (row === undefined || row.start === null || row.end === null) {
      return undefined;
    }
    return { start: row.start, end: row.end };
  }

  /**
   * Career spans for a batch of coaches, keyed by coach id: the UTC calendar
   * days of each coach's first and last recorded match, computed exactly as
   * `getCareerSpan` does but in one grouped query. A coach with no recorded
   * matches has no row in the grouped result and so no entry in the map. An
   * empty id list short-circuits rather than issuing an empty `inArray`,
   * which SQL would reject.
   */
  async getCareerSpansByIds(
    coachIds: number[],
  ): Promise<Map<number, { start: string; end: string }>> {
    if (coachIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        coachId: teams.coachId,
        start: sql<string>`(min(${matches.playedAt}) at time zone 'UTC')::date`,
        end: sql<string>`(max(${matches.playedAt}) at time zone 'UTC')::date`,
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(inArray(teams.coachId, coachIds))
      .groupBy(teams.coachId);
    return new Map(
      rows.map((row) => [row.coachId, { start: row.start, end: row.end }]),
    );
  }

  getTopTeamsByMatchesPlayed(
    coachId: number,
    limit: number,
  ): Promise<{ id: number; name: string; count: number }[]> {
    return this.db
      .select({
        id: teams.id,
        name: teams.name,
        count: countDistinct(matches.id),
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teams.coachId, coachId))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(matches.id)))
      .limit(limit);
  }

  async countMatchesPlayedByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.db
      .select({
        coachId: coaches.id,
        name: coaches.name,
        count: countDistinct(matches.id),
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
      .groupBy(coaches.id, coaches.name)
      .orderBy(desc(countDistinct(matches.id)))
      .limit(limit);
  }

  /**
   * The won/lost/drawn siblings of `countMatchesPlayedByCoach`: the same
   * league/era/match-category scope, narrowed to matches with the given
   * outcome for the coach's own side. See `MatchOutcomeCountsService` for the
   * query and its dedup semantics.
   */
  countMatchesWonByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByCoach({
      outcome: 'won',
      scope,
      limit,
    });
  }

  countMatchesLostByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByCoach({
      outcome: 'lost',
      scope,
      limit,
    });
  }

  countMatchesDrawnByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByCoach({
      outcome: 'drawn',
      scope,
      limit,
    });
  }

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

  /**
   * Coaches ranked by distinct competitions entered. A match category narrows
   * this to the competitions in which the coach's teams actually played a match
   * of that category (e.g. the competitions they reached the final of), which
   * needs the played matches joined in — registration alone
   * (`competitionTeams`) carries no category. The join is added only on that
   * path so the unfiltered count keeps counting entries rather than
   * appearances.
   */
  async countCompetitionsByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    const eraFilter = and(
      scope.leagueId === undefined
        ? undefined
        : eq(eras.leagueId, scope.leagueId),
      scope.eraId === undefined ? undefined : eq(teamEras.eraId, scope.eraId),
    );
    const base = this.db
      .select({
        coachId: coaches.id,
        name: coaches.name,
        count: countDistinct(competitions.id),
      })
      .from(competitions)
      .innerJoin(
        competitionTeams,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId));
    if (scope.category === undefined) {
      return base
        .where(eraFilter)
        .groupBy(coaches.id, coaches.name)
        .orderBy(desc(countDistinct(competitions.id)))
        .limit(limit);
    }
    return base
      .innerJoin(matchTeams, eq(matchTeams.teamEraId, teamEras.id))
      .innerJoin(
        matches,
        and(
          eq(matches.id, matchTeams.matchId),
          eq(matches.competitionId, competitions.id),
          eq(matches.category, scope.category),
        ),
      )
      .where(eraFilter)
      .groupBy(coaches.id, coaches.name)
      .orderBy(desc(countDistinct(competitions.id)))
      .limit(limit);
  }

  async countTeamsByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    const base = this.db
      .select({
        coachId: coaches.id,
        name: coaches.name,
        count: countDistinct(teams.id),
      })
      .from(coaches)
      .innerJoin(teams, eq(teams.coachId, coaches.id));
    if (scope.leagueId !== undefined) {
      return base
        .innerJoin(teamEras, eq(teamEras.teamId, teams.id))
        .innerJoin(
          eras,
          and(eq(eras.id, teamEras.eraId), eq(eras.leagueId, scope.leagueId)),
        )
        .groupBy(coaches.id, coaches.name)
        .orderBy(desc(countDistinct(teams.id)))
        .limit(limit);
    }
    if (scope.eraId !== undefined) {
      return base
        .innerJoin(
          teamEras,
          and(eq(teamEras.teamId, teams.id), eq(teamEras.eraId, scope.eraId)),
        )
        .groupBy(coaches.id, coaches.name)
        .orderBy(desc(countDistinct(teams.id)))
        .limit(limit);
    }
    return base
      .groupBy(coaches.id, coaches.name)
      .orderBy(desc(countDistinct(teams.id)))
      .limit(limit);
  }

  async countErasByCoach(
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.db
      .select({
        coachId: coaches.id,
        name: coaches.name,
        count: countDistinct(teamEras.eraId),
      })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .groupBy(coaches.id, coaches.name)
      .orderBy(desc(countDistinct(teamEras.eraId)))
      .limit(limit);
  }

  countFoulsCommittedByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    // Deliberately does not forward scope.competitionId: coach toplists are
    // league/era/match-category-scoped only, matching the other
    // match-event-backed coach.toplist.* facts (the trophy toplist below is
    // the exception, since a trophy award belongs to a competition).
    return this.matchEventCounts.countMatchEventsByCoach({
      selector: { role: 'acting', types: FOUL_TYPES },
      scope: {
        leagueId: scope.leagueId,
        eraId: scope.eraId,
        category: scope.category,
      },
      limit,
    });
  }

  /**
   * Coaches ranked by the total number of trophies their teams have won,
   * across every team they have coached. Unlike countFoulsCommittedByCoach,
   * the competitionId is forwarded: a trophy award belongs to a competition,
   * so this fact is competition-scopable. The scope's match category is
   * ignored by the shared service — a trophy award is not a match event.
   */
  countTrophiesByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.trophyAwardCounts.countTrophiesByCoach(scope, limit);
  }

  countAll(): Promise<number> {
    return countRows(this.db, coaches);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.coachId) })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.coachId) })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.coachId) })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}
