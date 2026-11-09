import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  competitionGroups,
  competitions,
  competitionTeams,
  count,
  DB,
  eq,
  eras,
  ilike,
  leagues,
  matches,
  sql,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type { CompetitionType } from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';

/**
 * Read-only competition lookups, listings and scoped counts for the Discord
 * bot. Competition ingestion, `findById` and the importers' group lookups are
 * `CompetitionsService` in packages/game-data.
 */
@Injectable()
export class CompetitionsQueriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  countAll(): Promise<number> {
    return countRows(this.db, competitions);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(competitions)
      .where(eq(competitions.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(competitions)
      .innerJoin(eras, eq(eras.id, competitions.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByType(
    type: CompetitionType,
    eraId?: number,
    leagueId?: number,
  ): Promise<number> {
    if (leagueId !== undefined) {
      const [row] = await this.db
        .select({ count: count() })
        .from(competitions)
        .innerJoin(eras, eq(eras.id, competitions.eraId))
        .where(and(eq(competitions.type, type), eq(eras.leagueId, leagueId)));
      return row.count;
    }
    const [row] = await this.db
      .select({ count: count() })
      .from(competitions)
      .where(
        eraId === undefined
          ? eq(competitions.type, type)
          : and(eq(competitions.type, type), eq(competitions.eraId, eraId)),
      );
    return row.count;
  }

  async findByIdWithEra(id: number): Promise<
    | {
        id: number;
        name: string;
        type: CompetitionType;
        eraId: number;
        eraName: string;
        /** The era's own span (`null` end = ongoing), for the `Era:` line. */
        eraStartDate: string;
        eraEndDate: string | null;
        competitionGroupId: number;
        competitionGroupName: string;
        startDate: string;
        endDate: string | null;
      }
    | undefined
  > {
    const rows = await this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
        eraId: competitions.eraId,
        eraName: eras.name,
        eraStartDate: eras.startDate,
        eraEndDate: eras.endDate,
        competitionGroupId: competitions.competitionGroupId,
        competitionGroupName: competitionGroups.name,
        startDate: competitions.startDate,
        endDate: competitions.endDate,
      })
      .from(competitions)
      .innerJoin(eras, eq(eras.id, competitions.eraId))
      .innerJoin(
        competitionGroups,
        eq(competitionGroups.id, competitions.competitionGroupId),
      )
      .where(eq(competitions.id, id));
    return rows[0];
  }

  listTeams(competitionId: number): Promise<{ id: number; name: string }[]> {
    // competition_teams links a competition to team_eras; join through to teams
    // and dedupe by team (groupBy) so a team appears once even if it were
    // linked via multiple team-eras. Ordered by name for stable button order.
    return this.db
      .select({ id: teams.id, name: teams.name })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(competitionTeams.competitionId, competitionId))
      .groupBy(teams.id, teams.name)
      .orderBy(teams.name);
  }

  listByEraChronological(eraId: number): Promise<
    {
      id: number;
      name: string;
      type: CompetitionType;
      startDate: string;
      endDate: string | null;
    }[]
  > {
    // Left join keeps competitions that have no matches yet; grouping collapses
    // the join back to one row per competition, and the min(playedAt) aggregate
    // gives each competition's earliest match date. `nulls last` sorts
    // never-played competitions after every dated one.
    return this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
        startDate: competitions.startDate,
        endDate: competitions.endDate,
      })
      .from(competitions)
      .leftJoin(matches, eq(matches.competitionId, competitions.id))
      .where(eq(competitions.eraId, eraId))
      .groupBy(competitions.id)
      .orderBy(sql`min(${matches.playedAt}) asc nulls last`);
  }

  /**
   * Every competition belonging to one recurring group, oldest first. Mirrors
   * `listByEraChronological`: the left join on matches keeps competitions that
   * have no matches yet, `groupBy` collapses that join back to one row per
   * competition, and `min(playedAt) asc nulls last` sorts never-played
   * competitions after every dated one *within their era*. Each competition's
   * era name comes along so the group deepdive can say which era an instance
   * ran in — and ordering by `eras.startDate` first, ahead of the match-date
   * aggregate, is what the deepdive's era-section grouping relies on: it
   * guarantees every row of one era is adjacent in the result, even an
   * unplayed competition that would otherwise sort to the very end and split
   * its era's section in two. `eras.id` is a tiebreaker right after it:
   * `startDate` carries no uniqueness constraint, so two distinct eras
   * sharing a start date would otherwise sort arbitrarily relative to each
   * other and could interleave, splitting one of them into two sections.
   */
  listByCompetitionGroupChronological(competitionGroupId: number): Promise<
    {
      id: number;
      name: string;
      eraId: number;
      eraName: string;
      /** The era's own span (`null` end = ongoing), for the section heading. */
      eraStartDate: string;
      eraEndDate: string | null;
      startDate: string;
      endDate: string | null;
    }[]
  > {
    return this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        eraId: competitions.eraId,
        eraName: eras.name,
        eraStartDate: eras.startDate,
        eraEndDate: eras.endDate,
        startDate: competitions.startDate,
        endDate: competitions.endDate,
      })
      .from(competitions)
      .innerJoin(eras, eq(eras.id, competitions.eraId))
      .leftJoin(matches, eq(matches.competitionId, competitions.id))
      .where(eq(competitions.competitionGroupId, competitionGroupId))
      .groupBy(competitions.id, eras.id)
      .orderBy(
        eras.startDate,
        eras.id,
        sql`min(${matches.playedAt}) asc nulls last`,
      );
  }

  /**
   * Every competition with the era it belongs to. Unordered: the only caller
   * (the random-insights scheduler) picks one at random, so paying for a sort
   * would be wasted work.
   */
  listAllWithEraId(): Promise<
    {
      id: number;
      name: string;
      eraId: number;
      startDate: string;
      endDate: string | null;
    }[]
  > {
    return this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        eraId: competitions.eraId,
        startDate: competitions.startDate,
        endDate: competitions.endDate,
      })
      .from(competitions);
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string; leagueName: string }[]> {
    return this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        leagueName: leagues.name,
      })
      .from(competitions)
      .innerJoin(eras, eq(eras.id, competitions.eraId))
      .innerJoin(leagues, eq(leagues.id, eras.leagueId))
      .where(ilike(competitions.name, `${this.likePattern.escape(prefix)}%`))
      .limit(limit);
  }
}
