import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  coaches,
  DB,
  desc,
  eq,
  eras,
  matches,
  matchTeams,
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
  PerSideEventCount,
} from '../shared/per-match-average-sql.service';
import { PerMatchAverageSqlService } from '../shared/per-match-average-sql.service';

/** `desc` ranks the highest average first, `asc` the lowest. */
export type CoachAverageDirection = PerMatchAverageDirection;

export interface CoachAverageRow {
  coachId: number;
  name: string;
  /** Per-match average, rounded to two decimals by the query. */
  average: number;
}

/** The per-side event count plus the ranking options of one coach average query. */
interface AveragePerMatchByCoachOptions extends PerSideEventCount {
  direction: CoachAverageDirection;
  scope: FactScope;
  limit: number;
}

/**
 * Per-match averages per coach, over every team the coach has coached: the
 * event counts of all of those teams' match sides, summed, divided by the
 * distinct matches any of them played. A match between two of the coach's
 * own teams therefore counts once as a match and with both sides' events.
 * Same event selectors, minimum-matches floor, rounding and scope as the
 * team averages, so a coach's figure is consistent with them and with the
 * coach totals.
 */
@Injectable()
export class CoachAverageStatisticsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly perMatchAverage: PerMatchAverageSqlService,
  ) {}

  /**
   * Casualties the coach's teams inflicted per match. A foul that caused a
   * casualty does not count: Blood Bowl awards no casualty credit for a foul.
   */
  averageCasualtiesCausedByCoach(
    scope: FactScope,
    direction: CoachAverageDirection,
    limit: number,
  ): Promise<CoachAverageRow[]> {
    return this.averagePerMatchByCoach({
      ...this.perMatchAverage.matchEventsOnSide({
        role: 'acting',
        types: CASUALTY_CAUSED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /** Casualties of any severity the coach's players suffered per match. */
  averageCasualtiesSufferedByCoach(
    scope: FactScope,
    direction: CoachAverageDirection,
    limit: number,
  ): Promise<CoachAverageRow[]> {
    return this.averagePerMatchByCoach({
      ...this.perMatchAverage.matchEventsOnSide({
        role: 'consequence',
        types: CASUALTY_SUFFERED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /** Serious injuries the coach's teams inflicted per match. */
  averageSeriousInjuriesCausedByCoach(
    scope: FactScope,
    direction: CoachAverageDirection,
    limit: number,
  ): Promise<CoachAverageRow[]> {
    return this.averagePerMatchByCoach({
      ...this.perMatchAverage.matchEventsOnSide({
        role: 'acting',
        types: SERIOUS_INJURY_CAUSED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /** Casualties whose effect outlasts the match, suffered per match. */
  averageSeriousInjuriesSufferedByCoach(
    scope: FactScope,
    direction: CoachAverageDirection,
    limit: number,
  ): Promise<CoachAverageRow[]> {
    return this.averagePerMatchByCoach({
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
   * Lasting injuries the coach's teams inflicted per match: a casualty action
   * whose own row carries a lasting consequence, so a foul does not count.
   */
  averageLastingInjuriesCausedByCoach(
    scope: FactScope,
    direction: CoachAverageDirection,
    limit: number,
  ): Promise<CoachAverageRow[]> {
    return this.averagePerMatchByCoach({
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

  /** Casualties that permanently diminish a player, suffered per match. */
  averageLastingInjuriesSufferedByCoach(
    scope: FactScope,
    direction: CoachAverageDirection,
    limit: number,
  ): Promise<CoachAverageRow[]> {
    return this.averagePerMatchByCoach({
      ...this.perMatchAverage.matchEventsOnSide({
        role: 'consequence',
        types: LASTING_INJURY_SUFFERED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /** Opponents the coach's teams killed per match; a foul that kills does not count. */
  averageDeathsCausedByCoach(
    scope: FactScope,
    direction: CoachAverageDirection,
    limit: number,
  ): Promise<CoachAverageRow[]> {
    return this.averagePerMatchByCoach({
      ...this.perMatchAverage.matchEventsOnSide({
        role: 'acting',
        types: DEATH_CAUSED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /** The coach's players killed per match, however they died. */
  averageDeathsSufferedByCoach(
    scope: FactScope,
    direction: CoachAverageDirection,
    limit: number,
  ): Promise<CoachAverageRow[]> {
    return this.averagePerMatchByCoach({
      ...this.perMatchAverage.matchEventsOnSide({
        role: 'consequence',
        types: DEATH_SUFFERED_TYPES,
      }),
      direction,
      scope,
      limit,
    });
  }

  /**
   * One row per (match, side) of any of the coach's teams, grouped by coach.
   * `count(distinct matches.id)` keeps a match between two of the coach's
   * own teams to one match in the denominator, while `sum` still adds both
   * sides' events.
   */
  private averagePerMatchByCoach(
    options: AveragePerMatchByCoachOptions,
  ): Promise<CoachAverageRow[]> {
    const { perMatchValue, perSideJoin, direction, scope, limit } = options;
    const average = this.perMatchAverage.average(perMatchValue);
    return this.db
      .select({ coachId: coaches.id, name: coaches.name, average })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .leftJoin(perSideJoin.table, perSideJoin.on)
      .where(this.perMatchAverage.scopeFilter(scope))
      .groupBy(coaches.id, coaches.name)
      .having(this.perMatchAverage.minimumMatches())
      .orderBy(
        direction === 'asc' ? asc(average) : desc(average),
        asc(coaches.name),
      )
      .limit(limit);
  }
}
