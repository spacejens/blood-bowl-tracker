import type { SQL } from '@blood-bowl-tracker/db';
import {
  and,
  eq,
  eras,
  inArray,
  matches,
  matchEvents,
  matchTeams,
  sql,
  teamEras,
} from '@blood-bowl-tracker/db';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import type { MatchEventSelector } from './match-event-counts.service';

/**
 * The fewest matches in scope a team or coach needs before a per-match
 * average ranks it. Below this an average is noise: one lucky match would
 * top the list. Shares the 5-match threshold of the coach
 * average-time-between-matches toplist.
 */
export const MIN_MATCHES_FOR_PER_MATCH_AVERAGE = 5;

/** `desc` ranks the highest average first, `asc` the lowest. */
export type PerMatchAverageDirection = 'asc' | 'desc';

/**
 * A derived table left-joined onto `match_teams`, holding at most one row per
 * `match_teams.id`, so the join adds per-side values without fanning out.
 */
export interface PerSideJoin {
  table: SQL;
  on: SQL;
}

/**
 * The per-side numerator of a per-match average. `perMatchValue` is
 * evaluated once per joined `match_teams` row (one side of one match) and is
 * what gets summed before dividing by the distinct matches. `perSideJoin`,
 * when given, is left-joined onto `match_teams` first so `perMatchValue` can
 * read from it.
 */
export interface PerSideCount {
  perMatchValue: SQL;
  perSideJoin?: PerSideJoin;
}

/** A per-side numerator read from a pre-aggregated match-event count. */
export interface PerSideEventCount extends PerSideCount {
  perSideJoin: PerSideJoin;
}

/**
 * The SQL building blocks every per-match average query shares, whatever it
 * groups by: the per-side event count, the scope filter, the rounded average
 * and the minimum-matches floor. Pure fragment assembly with no I/O; the
 * team and coach average services own their joins and grouping.
 */
@Injectable()
export class PerMatchAverageSqlService {
  /**
   * The number of this side's match events matching the selector. The events
   * are counted once per side in a pre-aggregated derived table (one scan of
   * `match_events`, one row per side with a matching event), left-joined onto
   * `match_teams`; a side without a matching event gets no row there and
   * contributes zero instead of dropping out of the denominator. An acting
   * selector groups by the acting side and filters `action_type`; a
   * consequence selector groups by the victim's side and filters
   * `consequence_type`, the same split the total-based counts use. An
   * acting selector's optional `consequenceTypes` also filters
   * `consequence_type` on the same row, as the total-based counts do.
   */
  matchEventsOnSide(selector: MatchEventSelector): PerSideEventCount {
    const sideColumn =
      selector.role === 'acting'
        ? matchEvents.actingMatchTeamId
        : matchEvents.consequenceMatchTeamId;
    const typeFilter =
      selector.role === 'acting'
        ? and(
            inArray(matchEvents.actionType, selector.types),
            selector.consequenceTypes === undefined
              ? undefined
              : inArray(matchEvents.consequenceType, selector.consequenceTypes),
          )
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
   * Competition is deliberately ignored: too few teams or coaches reach the
   * 5-match floor inside a single competition for a ranking to be
   * meaningful.
   */
  scopeFilter(scope: FactScope): SQL | undefined {
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

  /**
   * The summed per-side value over the distinct matches. ::numeric before
   * dividing and rounding so PostgreSQL rounds half away from zero; ::double
   * precision after so the driver returns a number rather than numeric's
   * string.
   */
  average(perMatchValue: SQL): SQL<number> {
    return sql<number>`round(sum(${perMatchValue})::numeric / count(distinct ${matches.id}), 2)::double precision`;
  }

  /** The `having` clause applying `MIN_MATCHES_FOR_PER_MATCH_AVERAGE`. */
  minimumMatches(): SQL {
    return sql`count(distinct ${matches.id}) >= ${MIN_MATCHES_FOR_PER_MATCH_AVERAGE}`;
  }
}
