import type {
  ExternalId,
  MatchCategory,
  ResolveResult,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Team } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitionTeams,
  DB,
  eras,
  matches,
  matchTeams,
  races,
  teamEras,
  teamExternalIds,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, ilike, sql } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import type { TeamRaceAndCoachNames } from '../shared/team-race-coach-names';
import { getRaceAndCoachNamesByIds as queryRaceAndCoachNamesByIds } from '../shared/team-race-coach-names';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';
import { TeamsStatisticsService } from './teams-statistics.service';

export class TeamUpsertConflictError extends UpsertConflictError {}

export interface TeamWithEras extends Team {
  eras: { id: number; eraId: number }[];
}

@Injectable()
export class TeamsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
    private readonly statistics: TeamsStatisticsService,
  ) {}

  async upsert(
    data: UpsertTeam,
  ): Promise<{ team: TeamWithEras; created: boolean }> {
    const { row: team, created } = await upsertByExternalIds<
      typeof teams,
      typeof teamExternalIds
    >({
      db: this.db,
      entityTable: teams,
      entityIdColumn: teams.id,
      values: {
        name: data.name,
        raceId: data.raceId,
        coachId: data.coachId,
      },
      externalIdTable: teamExternalIds,
      ownerIdColumn: teamExternalIds.teamId,
      externalSystemIdColumn: teamExternalIds.externalSystemId,
      externalIdColumn: teamExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: TeamUpsertConflictError,
      entityLabelPlural: 'teams',
      buildExternalIdRow: (teamId, pair) => ({ teamId, ...pair }),
    });

    const eras = await this.syncEras(team.id, data.eras);
    return { team: { ...team, eras }, created };
  }

  /**
   * Resolve one external-id pair to the team that already declares it. The
   * read-only half of what `upsert` does internally, exposed on its own so a
   * caller can reference a team imported in an earlier run, phase or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: teamExternalIds,
      ownerIdColumn: teamExternalIds.teamId,
      externalSystemIdColumn: teamExternalIds.externalSystemId,
      externalIdColumn: teamExternalIds.externalId,
      externalIds,
    });
  }

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
    // null start marks a team that has recorded no matches. Casting to ::date
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
      .where(eq(teams.id, teamId));
    if (row === undefined || row.start === null || row.end === null) {
      return undefined;
    }
    return { start: row.start, end: row.end };
  }

  getRaceAndCoachNamesByIds(
    teamIds: number[],
  ): Promise<Map<number, TeamRaceAndCoachNames>> {
    return queryRaceAndCoachNamesByIds({ db: this.db, teamIds });
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

  // Delegations to TeamsStatisticsService for backward compatibility
  getTopPlayersByMatchEventCount(
    teamId: number,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.statistics.getTopPlayersByMatchEventCount(teamId, limit);
  }

  async countMatchesPlayedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countMatchesPlayedByTeam(scope, limit);
  }

  countMatchesWonByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countMatchesWonByTeam(scope, limit);
  }

  countMatchesLostByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countMatchesLostByTeam(scope, limit);
  }

  countMatchesDrawnByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countMatchesDrawnByTeam(scope, limit);
  }

  async countCompetitionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countCompetitionsByTeam(scope, limit);
  }

  async countErasByTeam(
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countErasByTeam(limit);
  }

  countTouchdownsScoredByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countTouchdownsScoredByTeam(scope, limit);
  }

  countCompletionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countCompletionsByTeam(scope, limit);
  }

  countInterceptionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countInterceptionsByTeam(scope, limit);
  }

  countDeflectionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countDeflectionsByTeam(scope, limit);
  }

  countCasualtiesCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countCasualtiesCausedByTeam(scope, limit);
  }

  countSeriousInjuriesCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countSeriousInjuriesCausedByTeam(scope, limit);
  }

  countDeathsCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countDeathsCausedByTeam(scope, limit);
  }

  countFoulsCommittedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countFoulsCommittedByTeam(scope, limit);
  }

  countTimesSentOffByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countTimesSentOffByTeam(scope, limit);
  }

  countCasualtiesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countCasualtiesSufferedByTeam(scope, limit);
  }

  countSeriousInjuriesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countSeriousInjuriesSufferedByTeam(scope, limit);
  }

  countLastingInjuriesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countLastingInjuriesSufferedByTeam(scope, limit);
  }

  countDeathsSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.countDeathsSufferedByTeam(scope, limit);
  }

  sumExpensiveMistakesByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.statistics.sumExpensiveMistakesByTeam(scope, limit);
  }

  listBiggestExpensiveMistakes(
    scope: FactScope,
    limit: number,
  ): Promise<
    {
      teamId: number;
      name: string;
      count: number;
      date: string;
      category: MatchCategory;
    }[]
  > {
    return this.statistics.listBiggestExpensiveMistakes(scope, limit);
  }

  private async syncEras(
    teamId: number,
    eraIds: number[],
  ): Promise<{ id: number; eraId: number }[]> {
    const existing = await this.db
      .select({ id: teamEras.id, eraId: teamEras.eraId })
      .from(teamEras)
      .where(eq(teamEras.teamId, teamId));

    const existingEraIds = new Set(existing.map((r) => r.eraId));
    const toInsert = eraIds.filter((eraId) => !existingEraIds.has(eraId));

    if (toInsert.length === 0) {
      return existing;
    }

    const inserted = await this.db
      .insert(teamEras)
      .values(toInsert.map((eraId) => ({ teamId, eraId })))
      .returning({ id: teamEras.id, eraId: teamEras.eraId });

    return [...existing, ...inserted];
  }
}
