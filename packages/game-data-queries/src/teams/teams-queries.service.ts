import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitionTeams,
  DB,
  eq,
  eras,
  ilike,
  matches,
  matchTeams,
  races,
  sql,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';

/**
 * Read-only team lookups and scoped counts for the Discord bot. Team
 * ingestion is `TeamsService` in packages/game-data; team toplists are
 * `TeamsStatisticsService` and `TeamAverageStatisticsService`.
 */
@Injectable()
export class TeamsQueriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(ilike(teams.name, `${this.likePattern.escape(prefix)}%`))
      .limit(limit);
  }

  async findById(id: number): Promise<
    | {
        id: number;
        name: string;
        raceName: string;
        raceId: number;
        coachName: string;
        coachId: number;
      }
    | undefined
  > {
    const rows = await this.db
      .select({
        id: teams.id,
        name: teams.name,
        raceName: races.name,
        raceId: races.id,
        coachName: coaches.name,
        coachId: coaches.id,
      })
      .from(teams)
      .innerJoin(races, eq(races.id, teams.raceId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(eq(teams.id, id));
    return rows[0];
  }

  async listEras(teamId: number): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: eras.id, name: eras.name })
      .from(teamEras)
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(teamEras.teamId, teamId))
      .orderBy(eras.startDate, eras.name);
  }

  async getCareerSpan(
    teamId: number,
  ): Promise<{ start: string; end: string } | undefined> {
    // Aggregate over zero rows still returns one row with null start/end, so a
    // null start marks a team that has recorded no matches. Each aggregate is
    // converted to a UTC calendar day (YYYY-MM-DD) after aggregating, so the
    // span does not depend on the database session's timezone and the resolver
    // can render the strings directly.
    const [row] = await this.db
      .select({
        start: sql<
          string | null
        >`(min(${matches.playedAt}) at time zone 'UTC')::date`,
        end: sql<
          string | null
        >`(max(${matches.playedAt}) at time zone 'UTC')::date`,
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teams.id, teamId));
    if (row === undefined || row.start === null || row.end === null) {
      return undefined;
    }
    return { start: row.start, end: row.end };
  }

  countAll(): Promise<number> {
    return countRows(this.db, teams);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({
        count: sql<number>`cast(count(distinct ${teamEras.teamId}) as integer)`,
      })
      .from(teamEras)
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({
        count: sql<number>`cast(count(distinct ${teamEras.teamId}) as integer)`,
      })
      .from(teamEras)
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({
        count: sql<number>`cast(count(distinct ${teamEras.teamId}) as integer)`,
      })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}
