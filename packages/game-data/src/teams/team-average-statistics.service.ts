import type { Db, SQL } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  DB,
  desc,
  eq,
  eras,
  inArray,
  matches,
  matchEvents,
  matchTeams,
  sql,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { FactScope } from '../shared/fact-scope';
import type { MatchEventSelector } from '../shared/match-event-counts.service';
import {
  CASUALTY_CAUSED_TYPES,
  CASUALTY_SUFFERED_TYPES,
  DEATH_CAUSED_TYPES,
  DEATH_SUFFERED_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
} from '../shared/match-event-types';

/**
 * The fewest matches in scope a team needs before a per-match average ranks
 * it. Below this an average is noise: one lucky match would top the list.
 * Shares the 5-match threshold of the coach average-time-between-matches
 * toplist.
 */
export const MIN_MATCHES_FOR_TEAM_AVERAGE = 5;

/** `desc` ranks the highest average first, `asc` the lowest. */
export type TeamAverageDirection = 'asc' | 'desc';

export interface TeamAverageRow {
  teamId: number;
  name: string;
  /** Per-match average, rounded to two decimals by the query. */
  average: number;
}

/**
 * A derived table left-joined onto `match_teams`, holding at most one row per
 * `match_teams.id`, so the join adds per-side values without fanning out.
 */
interface PerSideJoin {
  table: SQL;
  on: SQL;
}

/**
 * Options for the shared per-match average query. `perMatchValue` is
 * evaluated once per joined `match_teams` row (one team's side of one match)
 * and is what gets summed before dividing by the team's distinct matches.
 * `perSideJoin`, when given, is left-joined onto `match_teams` first so
 * `perMatchValue` can read from it.
 */
interface AveragePerMatchByTeamOptions {
  perMatchValue: SQL;
  perSideJoin?: PerSideJoin;
  direction: TeamAverageDirection;
  scope: FactScope;
  limit: number;
}

/** The per-side numerator and the join it reads from, for one statistic. */
type PerSideCount = Pick<
  AveragePerMatchByTeamOptions,
  'perMatchValue' | 'perSideJoin'
>;

/**
 * Per-match averages per team: a sum over each of the team's match sides,
 * divided by its distinct matches, with the `MIN_MATCHES_FOR_TEAM_AVERAGE`
 * floor applied in the same query. Each statistic supplies only its per-side
 * numerator.
 */
@Injectable()
export class TeamAverageStatisticsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The team's own touchdowns per match (`match_teams.score`). */
  averageTouchdownsScoredByTeam(
    scope: FactScope,
    direction: TeamAverageDirection,
    limit: number,
  ): Promise<TeamAverageRow[]> {
    return this.averagePerMatchByTeam({
      perMatchValue: sql`${matchTeams.score}`,
      direction,
      scope,
      limit,
    });
  }

  /**
   * Touchdowns scored against the team per match: the summed score of every
   * other side of the same match, so a four-team merged final counts all
   * three opponents. The correlated subquery aliases its own `match_teams`
   * as `opponent_sides`, so the unaliased column references resolve to the
   * outer query's side.
   */
  averageTouchdownsConcededByTeam(
    scope: FactScope,
    direction: TeamAverageDirection,
    limit: number,
  ): Promise<TeamAverageRow[]> {
    return this.averagePerMatchByTeam({
      perMatchValue: sql`(select coalesce(sum(opponent_sides.score), 0) from ${matchTeams} as opponent_sides where opponent_sides.match_id = ${matchTeams.matchId} and opponent_sides.id <> ${matchTeams.id})`,
      direction,
      scope,
      limit,
    });
  }

  /**
   * Casualties the team inflicted per match. Same type set as the
   * casualties-caused total, so a foul that caused a casualty does not
   * count: Blood Bowl awards no casualty credit for a foul.
   */
  averageCasualtiesCausedByTeam(
    scope: FactScope,
    direction: TeamAverageDirection,
    limit: number,
  ): Promise<TeamAverageRow[]> {
    return this.averagePerMatchByTeam({
      ...this.matchEventsOnSide({
        role: 'acting',
        types: CASUALTY_CAUSED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /** Casualties of any severity the team's players suffered per match. */
  averageCasualtiesSufferedByTeam(
    scope: FactScope,
    direction: TeamAverageDirection,
    limit: number,
  ): Promise<TeamAverageRow[]> {
    return this.averagePerMatchByTeam({
      ...this.matchEventsOnSide({
        role: 'consequence',
        types: CASUALTY_SUFFERED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /** Serious injuries the team inflicted per match. */
  averageSeriousInjuriesCausedByTeam(
    scope: FactScope,
    direction: TeamAverageDirection,
    limit: number,
  ): Promise<TeamAverageRow[]> {
    return this.averagePerMatchByTeam({
      ...this.matchEventsOnSide({
        role: 'acting',
        types: SERIOUS_INJURY_CAUSED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /**
   * Casualties whose effect outlasts the match, suffered by the team's
   * players per match.
   */
  averageSeriousInjuriesSufferedByTeam(
    scope: FactScope,
    direction: TeamAverageDirection,
    limit: number,
  ): Promise<TeamAverageRow[]> {
    return this.averagePerMatchByTeam({
      ...this.matchEventsOnSide({
        role: 'consequence',
        types: SERIOUS_INJURY_SUFFERED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /**
   * Casualties that permanently diminish a player, suffered by the team's
   * players per match.
   */
  averageLastingInjuriesSufferedByTeam(
    scope: FactScope,
    direction: TeamAverageDirection,
    limit: number,
  ): Promise<TeamAverageRow[]> {
    return this.averagePerMatchByTeam({
      ...this.matchEventsOnSide({
        role: 'consequence',
        types: LASTING_INJURY_SUFFERED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /**
   * Opponents the team's players killed per match. Same type set as the
   * deaths-caused total, so a foul that kills does not count.
   */
  averageDeathsCausedByTeam(
    scope: FactScope,
    direction: TeamAverageDirection,
    limit: number,
  ): Promise<TeamAverageRow[]> {
    return this.averagePerMatchByTeam({
      ...this.matchEventsOnSide({
        role: 'acting',
        types: DEATH_CAUSED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /** The team's players killed per match, however they died. */
  averageDeathsSufferedByTeam(
    scope: FactScope,
    direction: TeamAverageDirection,
    limit: number,
  ): Promise<TeamAverageRow[]> {
    return this.averagePerMatchByTeam({
      ...this.matchEventsOnSide({
        role: 'consequence',
        types: DEATH_SUFFERED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /**
   * The number of this side's match events matching the selector. The events
   * are counted once per side in a pre-aggregated derived table (one scan of
   * `match_events`, one row per side with a matching event), left-joined onto
   * `match_teams`; a side without a matching event gets no row there and
   * contributes zero instead of dropping out of the denominator. An acting
   * selector groups by the acting side and filters `action_type`; a
   * consequence selector groups by the victim's side and filters
   * `consequence_type`, the same split the total-based team counts use.
   */
  private matchEventsOnSide(selector: MatchEventSelector): PerSideCount {
    const sideColumn =
      selector.role === 'acting'
        ? matchEvents.actingMatchTeamId
        : matchEvents.consequenceMatchTeamId;
    const typeFilter =
      selector.role === 'acting'
        ? inArray(matchEvents.actionType, selector.types)
        : inArray(matchEvents.consequenceType, selector.types);
    return {
      perMatchValue: sql`coalesce(side_event_counts.event_count, 0)`,
      perSideJoin: {
        table: sql`(select ${sideColumn} as match_team_id, count(*) as event_count from ${matchEvents} where ${typeFilter} group by ${sideColumn}) as side_event_counts`,
        on: sql`side_event_counts.match_team_id = ${matchTeams.id}`,
      },
    };
  }

  /**
   * The league/era/match-category scope the matches-played toplists use.
   * Competition is deliberately ignored: too few teams reach the 5-match
   * floor inside a single competition for a ranking to be meaningful.
   */
  private scopeFilter(scope: FactScope): SQL | undefined {
    return and(
      scope.leagueId === undefined
        ? undefined
        : eq(eras.leagueId, scope.leagueId),
      scope.eraId === undefined ? undefined : eq(teamEras.eraId, scope.eraId),
      scope.category === undefined
        ? undefined
        : eq(matches.category, scope.category),
    );
  }

  private averagePerMatchByTeam(
    options: AveragePerMatchByTeamOptions,
  ): Promise<TeamAverageRow[]> {
    const { perMatchValue, perSideJoin, direction, scope, limit } = options;
    // ::numeric before dividing and rounding so PostgreSQL rounds half away
    // from zero; ::double precision after so the driver returns a number
    // rather than numeric's string.
    const average = sql<number>`round(sum(${perMatchValue})::numeric / count(distinct ${matches.id}), 2)::double precision`;
    const joined = this.db
      .select({ teamId: teams.id, name: teams.name, average })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .$dynamic();
    const query =
      perSideJoin === undefined
        ? joined
        : joined.leftJoin(perSideJoin.table, perSideJoin.on);
    return query
      .where(this.scopeFilter(scope))
      .groupBy(teams.id, teams.name)
      .having(
        sql`count(distinct ${matches.id}) >= ${MIN_MATCHES_FOR_TEAM_AVERAGE}`,
      )
      .orderBy(
        direction === 'asc' ? asc(average) : desc(average),
        asc(teams.name),
      )
      .limit(limit);
  }
}
