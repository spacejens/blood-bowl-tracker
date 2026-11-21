import type { Db } from '@blood-bowl-tracker/db';
import {
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
import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  CASUALTY_CAUSED_TYPES,
  CASUALTY_SUFFERED_TYPES,
  DEATH_CAUSED_TYPES,
  DEATH_SUFFERED_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
} from '@blood-bowl-tracker/game-data';
import { Inject, Injectable } from '@nestjs/common';

import type {
  PerMatchAverageDirection,
  PerSideCount,
} from '../shared/per-match-average-sql.service';
import { PerMatchAverageSqlService } from '../shared/per-match-average-sql.service';

/** `desc` ranks the highest average first, `asc` the lowest. */
export type TeamAverageDirection = PerMatchAverageDirection;

export interface TeamAverageRow {
  teamId: number;
  name: string;
  /** Per-match average, rounded to two decimals by the query. */
  average: number;
}

/** The per-side numerator plus the ranking options of one team average query. */
interface AveragePerMatchByTeamOptions extends PerSideCount {
  direction: TeamAverageDirection;
  scope: FactScope;
  limit: number;
}

/**
 * Per-match averages per team: a sum over each of the team's match sides,
 * divided by its distinct matches, with the `MIN_MATCHES_FOR_PER_MATCH_AVERAGE`
 * floor applied in the same query. Each statistic supplies only its per-side
 * numerator.
 */
@Injectable()
export class TeamAverageStatisticsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly perMatchAverage: PerMatchAverageSqlService,
  ) {}

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
      ...this.perMatchAverage.matchEventsOnSide({
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
      ...this.perMatchAverage.matchEventsOnSide({
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
      ...this.perMatchAverage.matchEventsOnSide({
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
      ...this.perMatchAverage.matchEventsOnSide({
        role: 'consequence',
        types: SERIOUS_INJURY_SUFFERED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /**
   * Lasting injuries the team's players inflicted per match. Same selector as
   * the lasting-injuries-caused total: a casualty action whose own row
   * carries a lasting consequence, so a foul does not count.
   */
  averageLastingInjuriesCausedByTeam(
    scope: FactScope,
    direction: TeamAverageDirection,
    limit: number,
  ): Promise<TeamAverageRow[]> {
    return this.averagePerMatchByTeam({
      ...this.perMatchAverage.matchEventsOnSide({
        role: 'acting',
        types: CASUALTY_CAUSED_TYPES,
        consequenceTypes: LASTING_INJURY_SUFFERED_TYPES,
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
      ...this.perMatchAverage.matchEventsOnSide({
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
      ...this.perMatchAverage.matchEventsOnSide({
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
      ...this.perMatchAverage.matchEventsOnSide({
        role: 'consequence',
        types: DEATH_SUFFERED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  private averagePerMatchByTeam(
    options: AveragePerMatchByTeamOptions,
  ): Promise<TeamAverageRow[]> {
    const { perMatchValue, perSideJoin, direction, scope, limit } = options;
    const average = this.perMatchAverage.average(perMatchValue);
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
      .where(this.perMatchAverage.scopeFilter(scope))
      .groupBy(teams.id, teams.name)
      .having(this.perMatchAverage.minimumMatches())
      .orderBy(
        direction === 'asc' ? asc(average) : desc(average),
        asc(teams.name),
      )
      .limit(limit);
  }
}
