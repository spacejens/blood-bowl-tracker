import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  coaches,
  competitions,
  competitionTeams,
  countDistinct,
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
import { Inject, Injectable } from '@nestjs/common';

/**
 * The coach participation toplists: matches played, competitions entered,
 * teams coached and eras active. Reached through `CoachesQueriesService`,
 * which delegates its matching `count*ByCoach` methods here.
 */
@Injectable()
export class CoachParticipationCountsService {
  constructor(@Inject(DB) private readonly db: Db) {}

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
}
