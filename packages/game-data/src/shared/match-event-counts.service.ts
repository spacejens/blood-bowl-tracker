import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  DB,
  eras,
  matches,
  matchEvents,
  matchTeams,
  players,
  positions,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import type { FactScope } from './fact-scope';
import type { ActionType, ConsequenceType } from './match-event-types';
import { EXPENSIVE_MISTAKE_TYPES } from './match-event-types';
import { MatchScopeFilterService } from './match-scope-filter.service';

/**
 * A role paired with the type set that role's filter operates over. Modelled
 * as a discriminated union (rather than independent `role` and `types`
 * parameters) so that a role/type-set mismatch — e.g. `role: 'acting'` with
 * consequence-only types — is a compile error instead of a cast-hidden bug
 * that only fails at the database.
 */
export type MatchEventSelector =
  | { role: 'acting'; types: readonly ActionType[] }
  | { role: 'consequence'; types: readonly ConsequenceType[] };

/**
 * Options shared by every match-event count: the role/type selector and the
 * optional fact scope. Taking the whole `FactScope` (rather than mirroring
 * its fields one by one) keeps the callers — which already hold a
 * `FactScope` — from restating it at every call site.
 */
export interface CountMatchEventsOptions {
  selector: MatchEventSelector;
  scope?: FactScope;
  limit: number;
}

/** Options for the single-player, type-filtered event counter. */
export interface CountMatchEventsForPlayerOptions {
  playerId: number;
  selector: MatchEventSelector;
  scope?: FactScope;
}

/**
 * Options shared by the two expensive-mistake queries: the optional fact
 * scope, and the required SQL row cap.
 */
export interface ExpensiveMistakesOptions {
  scope?: FactScope;
  limit: number;
}

@Injectable()
export class MatchEventCountsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly matchScopeFilter: MatchScopeFilterService,
  ) {}

  /**
   * The where clause shared by every match-event count: the type filter for
   * the given selector's role, optionally narrowed to a league, era,
   * competition and/or match category. `undefined` for any scope field means
   * "no filter", matching the public `count*` signatures.
   */
  private matchEventFilter(
    selector: MatchEventSelector,
    scope: FactScope,
  ): SQL | undefined {
    return and(
      selector.role === 'acting'
        ? inArray(matchEvents.actionType, selector.types)
        : inArray(matchEvents.consequenceType, selector.types),
      this.matchScopeFilter.build(scope),
    );
  }

  /**
   * Match events matching the given selector, counted per player and ordered
   * most-first. Ties keep the query's natural order — the caller ranks them.
   *
   * Star players are excluded: a star's identity is their position and
   * each hire is its own `players` row, so a popular star would occupy several
   * slots of one global ranking — and stars, being the strongest players in the
   * game, tend to dominate these rankings outright. The filter lives here rather
   * than in the shared `matchEventFilter` because the per-team and per-coach
   * counters do not join `players` at all, and `countMatchEventsForPlayer`
   * deliberately keeps stars (see the design spec's "Deliberately left
   * unchanged").
   */
  async countMatchEventsByPlayer(
    options: CountMatchEventsOptions,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    const { selector, scope = {}, limit } = options;
    return this.db
      .select({
        playerId: players.id,
        name: players.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(
        players,
        eq(
          players.id,
          selector.role === 'acting'
            ? matchEvents.actingPlayerId
            : matchEvents.consequencePlayerId,
        ),
      )
      .innerJoin(
        matchTeams,
        eq(
          matchTeams.id,
          selector.role === 'acting'
            ? matchEvents.actingMatchTeamId
            : matchEvents.consequenceMatchTeamId,
        ),
      )
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(
        and(
          this.matchEventFilter(selector, scope),
          eq(positions.isStarPlayer, false),
        ),
      )
      .groupBy(players.id, players.name)
      .orderBy(desc(count(matchEvents.id)))
      .limit(limit);
  }

  /**
   * Match events matching the given selector, counted per team and ordered
   * most-first. The join graph differs from the per-player one (it
   * reaches `teams` through `teamEras` rather than joining `players`), which is
   * why the two groupings are separate methods rather than one parameterised
   * over the select shape.
   */
  async countMatchEventsByTeam(
    options: CountMatchEventsOptions,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    const { selector, scope = {}, limit } = options;
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(
        matchTeams,
        eq(
          matchTeams.id,
          selector.role === 'acting'
            ? matchEvents.actingMatchTeamId
            : matchEvents.consequenceMatchTeamId,
        ),
      )
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(this.matchEventFilter(selector, scope))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(count(matchEvents.id)))
      .limit(limit);
  }

  /**
   * Match events matching the given selector, counted per coach and ordered
   * most-first. Extends countMatchEventsByTeam's join graph by one hop —
   * `teams.coachId -> coaches.id` — so a coach's total spans every team they
   * have coached. Accepts the shared options for consistency with its siblings;
   * the coach toplists that call it simply do not pass a competition scope.
   */
  async countMatchEventsByCoach(
    options: CountMatchEventsOptions,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    const { selector, scope = {}, limit } = options;
    return this.db
      .select({
        coachId: coaches.id,
        name: coaches.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(
        matchTeams,
        eq(
          matchTeams.id,
          selector.role === 'acting'
            ? matchEvents.actingMatchTeamId
            : matchEvents.consequenceMatchTeamId,
        ),
      )
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(this.matchEventFilter(selector, scope))
      .groupBy(coaches.id, coaches.name)
      .orderBy(desc(count(matchEvents.id)))
      .limit(limit);
  }

  /**
   * Match events matching the selector for one specific player, returned as a
   * single total. Shares the join graph of `countMatchEventsByPlayer` but adds
   * an `eq(players.id, playerId)` filter and returns a scalar rather than a
   * per-player breakdown — the shape the player deepdive needs. Kept separate
   * from `countMatchEventsByPlayer` because the result shape differs — a
   * scalar, not a per-player breakdown — which is not worth parameterizing
   * over.
   */
  async countMatchEventsForPlayer(
    options: CountMatchEventsForPlayerOptions,
  ): Promise<number> {
    const { playerId, selector, scope = {} } = options;
    const [row] = await this.db
      .select({ count: count(matchEvents.id) })
      .from(matchEvents)
      .innerJoin(
        players,
        eq(
          players.id,
          selector.role === 'acting'
            ? matchEvents.actingPlayerId
            : matchEvents.consequencePlayerId,
        ),
      )
      .innerJoin(
        matchTeams,
        eq(
          matchTeams.id,
          selector.role === 'acting'
            ? matchEvents.actingMatchTeamId
            : matchEvents.consequenceMatchTeamId,
        ),
      )
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(
        and(this.matchEventFilter(selector, scope), eq(players.id, playerId)),
      );
    return row.count;
  }

  /**
   * Money each team has lost to expensive mistakes, summed per team and ordered
   * most-first. Shares countMatchEventsByTeam's consequence-side join graph and
   * the expensive-mistake filter, but sums matchEvents.expensiveMistake
   * (coalescing the per-group total to 0) instead of counting event rows. Kept
   * separate from the count helper because the aggregate and result shape differ.
   */
  async sumExpensiveMistakesByTeam(
    options: ExpensiveMistakesOptions,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    const { scope = {}, limit } = options;
    const selector = {
      role: 'consequence',
      types: EXPENSIVE_MISTAKE_TYPES,
    } as const;
    const total = sql<number>`coalesce(sum(${matchEvents.expensiveMistake}), 0)::int`;
    return this.db
      .select({ teamId: teams.id, name: teams.name, count: total })
      .from(matchEvents)
      .innerJoin(
        matchTeams,
        eq(matchTeams.id, matchEvents.consequenceMatchTeamId),
      )
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(this.matchEventFilter(selector, scope))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(total))
      .limit(limit);
  }

  /**
   * Individual expensive-mistake events, one row each (no grouping), each labelled
   * with the losing team and the ISO date of the match, ordered biggest-loss
   * first. Shares countMatchEventsByTeam's consequence-side join graph plus
   * matches.playedAt; `count` carries the lost amount so each row already fits the
   * leaderboard's ranking shape, and a team may legitimately appear on several
   * rows.
   *
   * Bounded by the caller-supplied `limit` — the render layer passes a generous
   * fetch limit (see `TOPLIST_FETCH_LIMIT`) so that `topRanksWithTies` still has
   * enough rows to see a full tie group at the cutoff.
   */
  async listBiggestExpensiveMistakes(
    options: ExpensiveMistakesOptions,
  ): Promise<
    {
      teamId: number;
      name: string;
      count: number;
      date: string;
      category: MatchCategory;
    }[]
  > {
    const { scope = {}, limit } = options;
    const selector = {
      role: 'consequence',
      types: EXPENSIVE_MISTAKE_TYPES,
    } as const;
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: sql<number>`${matchEvents.expensiveMistake}`,
        date: sql<string>`${matches.playedAt}::date`,
        category: matches.category,
      })
      .from(matchEvents)
      .innerJoin(
        matchTeams,
        eq(matchTeams.id, matchEvents.consequenceMatchTeamId),
      )
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(
        and(
          this.matchEventFilter(selector, scope),
          isNotNull(matchEvents.expensiveMistake),
        ),
      )
      .orderBy(desc(matchEvents.expensiveMistake))
      .limit(limit);
  }
}
