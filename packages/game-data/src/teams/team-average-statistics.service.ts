import type { Db, SQL } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  DB,
  desc,
  eq,
  eras,
  matches,
  matchTeams,
  sql,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { FactScope } from '../shared/fact-scope';

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
 * Options for the shared per-match average query. `perMatchValue` is
 * evaluated once per joined `match_teams` row (one team's side of one match)
 * and is what gets summed before dividing by the team's distinct matches.
 */
interface AveragePerMatchByTeamOptions {
  perMatchValue: SQL;
  direction: TeamAverageDirection;
  scope: FactScope;
  limit: number;
}

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
    const { perMatchValue, direction, scope, limit } = options;
    // ::numeric before dividing and rounding so PostgreSQL rounds half away
    // from zero; ::double precision after so the driver returns a number
    // rather than numeric's string.
    const average = sql<number>`round(sum(${perMatchValue})::numeric / count(distinct ${matches.id}), 2)::double precision`;
    return this.db
      .select({ teamId: teams.id, name: teams.name, average })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
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
