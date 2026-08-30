import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eras,
  matches,
  matchTeams,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { asc, countDistinct, desc, eq, sql } from 'drizzle-orm';

import type { FactScope } from '../shared/fact-scope';
import { MatchScopeFilterService } from '../shared/match-scope-filter.service';

/** One calendar date (month and day, across every recorded year) and how many matches were played on it. */
export interface DateMatchCount {
  month: number;
  day: number;
  count: number;
}

/**
 * Calendar dates ranked by how many matches were played on them, across every
 * recorded year — the same "on this date" scoping `OnThisDateService` uses.
 *
 * The join graph and the UTC extraction mirror
 * `OnThisDateService.countMatchesPlayed` exactly, so the two can never
 * disagree about which date a match falls on. `matchTeams`/`teamEras`/`eras`
 * are joined even though nothing selects from them, because
 * `MatchScopeFilterService` narrows on `eras.leagueId` and `teamEras.eraId`;
 * `countDistinct` then undoes the row multiplication that join introduces.
 */
@Injectable()
export class DateToplistService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly matchScopeFilter: MatchScopeFilterService,
  ) {}

  /**
   * `direction` is the only difference between the two public toplists: they
   * are the same metric read from opposite ends. The secondary chronological
   * ordering is deliberate — without it, tied dates would come back in
   * whatever order PostgreSQL happened to produce, so two identical requests
   * could render different lists.
   */
  private rankDatesByMatchCount(
    scope: FactScope,
    limit: number,
    direction: 'asc' | 'desc',
  ): Promise<DateMatchCount[]> {
    const month = sql<number>`extract(month from ${matches.playedAt} at time zone 'UTC')::int`;
    const day = sql<number>`extract(day from ${matches.playedAt} at time zone 'UTC')::int`;
    const matchCount = countDistinct(matches.id);
    return this.db
      .select({ month, day, count: matchCount })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(this.matchScopeFilter.build(scope))
      .groupBy(month, day)
      .orderBy(
        direction === 'desc' ? desc(matchCount) : asc(matchCount),
        month,
        day,
      )
      .limit(limit);
  }

  /** The dates on which the most matches were ever played, busiest first. */
  getMatchCountsByDateDescending(
    scope: FactScope,
    limit: number,
  ): Promise<DateMatchCount[]> {
    return this.rankDatesByMatchCount(scope, limit, 'desc');
  }

  /** The same metric read from the other end: the quietest recorded dates first. */
  getMatchCountsByDateAscending(
    scope: FactScope,
    limit: number,
  ): Promise<DateMatchCount[]> {
    return this.rankDatesByMatchCount(scope, limit, 'asc');
  }
}
