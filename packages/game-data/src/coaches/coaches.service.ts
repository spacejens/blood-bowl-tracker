import type { UpsertCoach } from '@blood-bowl-tracker/api-contract';
import type { Coach } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  coachExternalIds,
  competitions,
  competitionTeams,
  eras,
  matches,
  matchTeams,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, countDistinct, desc, eq, ilike, sql } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { countMatchEventsByCoach } from '../shared/match-event-counts';
import { FOUL_TYPES } from '../shared/match-event-types';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class CoachUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class CoachesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  async upsert(data: UpsertCoach): Promise<{ coach: Coach; created: boolean }> {
    const { row: coach, created } = await upsertByExternalIds<
      typeof coaches,
      typeof coachExternalIds
    >({
      db: this.db,
      entityTable: coaches,
      entityIdColumn: coaches.id,
      values: { name: data.name },
      externalIdTable: coachExternalIds,
      ownerIdColumn: coachExternalIds.coachId,
      externalSystemIdColumn: coachExternalIds.externalSystemId,
      externalIdColumn: coachExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: CoachUpsertConflictError,
      entityLabelPlural: 'coaches',
      buildExternalIdRow: (coachId, pair) => ({ coachId, ...pair }),
    });

    return { coach, created };
  }

  async findById(
    id: number,
  ): Promise<{ id: number; name: string } | undefined> {
    const rows = await this.db
      .select({ id: coaches.id, name: coaches.name })
      .from(coaches)
      .where(eq(coaches.id, id));
    return rows[0];
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: coaches.id, name: coaches.name })
      .from(coaches)
      .where(ilike(coaches.name, `${this.likePattern.escape(prefix)}%`))
      .limit(limit);
  }

  async getCareerSpan(
    coachId: number,
  ): Promise<{ start: string; end: string } | undefined> {
    // Aggregate over zero rows still returns one row with null start/end, so a
    // null start marks a coach who has recorded no matches. Casting to ::date
    // yields YYYY-MM-DD strings the resolver can render directly.
    const [row] = await this.db
      .select({
        start: sql<string | null>`min(${matches.playedAt})::date`,
        end: sql<string | null>`max(${matches.playedAt})::date`,
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teams.coachId, coachId));
    if (row === undefined || row.start === null || row.end === null) {
      return undefined;
    }
    return { start: row.start, end: row.end };
  }

  getTopTeamsByMatchesPlayed(
    coachId: number,
    limit: number,
  ): Promise<{ id: number; name: string; count: number }[]> {
    return this.db
      .select({
        id: teams.id,
        name: teams.name,
        count: countDistinct(matches.id),
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teams.coachId, coachId))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(matches.id)))
      .limit(limit);
  }

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
        ),
      )
      .groupBy(coaches.id, coaches.name)
      .orderBy(desc(countDistinct(matches.id)))
      .limit(limit);
  }

  async countCompetitionsByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.db
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
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(
        and(
          scope.leagueId === undefined
            ? undefined
            : eq(eras.leagueId, scope.leagueId),
          scope.eraId === undefined
            ? undefined
            : eq(teamEras.eraId, scope.eraId),
        ),
      )
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

  countFoulsCommittedByCoach(
    scope: FactScope,
    limit: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    // Deliberately does not forward scope.competitionId: coach toplists are
    // league/era-scoped only, matching every other coach.toplist.* fact.
    return countMatchEventsByCoach({
      db: this.db,
      selector: { role: 'acting', types: FOUL_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      limit,
    });
  }

  countAll(): Promise<number> {
    return countRows(this.db, coaches);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.coachId) })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.coachId) })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.coachId) })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}
