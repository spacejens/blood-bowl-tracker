import type { Db, SQL } from '@blood-bowl-tracker/db';
import {
  and,
  coaches,
  count,
  DB,
  desc,
  eq,
  eras,
  teamEras,
  teams,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { FactScope } from './fact-scope';

/**
 * Trophy-award counts, grouped by team or by coach. Both counts share one
 * join graph and one where clause, mirroring how MatchEventCountsService
 * pairs its own team- and coach-grouped counters — the coach variant extends
 * the team variant by exactly one hop, `teams.coachId -> coaches.id`, so a
 * coach's total is the sum of their teams' own totals.
 *
 * Counts every `trophy_awards` row tied to the team through its team era —
 * including player-kind awards (MVP, most casualties, ...), since
 * `team_era_id` is populated even for those. This is deliberately the same
 * aggregation as `TrophyAwardsService.countByTeam`, grouped rather than
 * filtered to one team, so the toplists and a team's own deepdive trophy
 * count agree.
 */
@Injectable()
export class TrophyAwardCountsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * The where clause shared by both counts. `scope.category` is deliberately
   * ignored: trophy awards are not match events, so there is no match-category
   * dimension (the fact-tree leaves correspondingly declare
   * `supportsMatchCategory: false`). League and era are read off the winning
   * team era rather than off the award's own competition; competition is read
   * straight off the award row. The two eras can only diverge on anomalous
   * data.
   */
  private trophyAwardFilter(scope: FactScope): SQL | undefined {
    return and(
      scope.leagueId === undefined
        ? undefined
        : eq(eras.leagueId, scope.leagueId),
      scope.eraId === undefined ? undefined : eq(teamEras.eraId, scope.eraId),
      scope.competitionId === undefined
        ? undefined
        : eq(trophyAwards.competitionId, scope.competitionId),
    );
  }

  /** Teams ranked by how many trophies they have won, most first. */
  countTrophiesByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: count(trophyAwards.id),
      })
      .from(trophyAwards)
      .innerJoin(teamEras, eq(teamEras.id, trophyAwards.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(this.trophyAwardFilter(scope))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(count(trophyAwards.id)))
      .limit(limit);
  }

  /**
   * Coaches ranked by how many trophies their teams have won, most first.
   * Same join graph and filter as countTrophiesByTeam plus the coach hop,
   * grouped by coach, so every team a coach has ever coached contributes.
   */
  countTrophiesByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.db
      .select({
        coachId: coaches.id,
        name: coaches.name,
        count: count(trophyAwards.id),
      })
      .from(trophyAwards)
      .innerJoin(teamEras, eq(teamEras.id, trophyAwards.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(this.trophyAwardFilter(scope))
      .groupBy(coaches.id, coaches.name)
      .orderBy(desc(count(trophyAwards.id)))
      .limit(limit);
  }
}
