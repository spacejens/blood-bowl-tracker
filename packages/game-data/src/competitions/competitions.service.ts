import type {
  ExternalId,
  ResolveResult,
  UpsertCompetition,
} from '@blood-bowl-tracker/api-contract';
import type { Competition, Db } from '@blood-bowl-tracker/db';
import {
  competitionExternalIds,
  competitions,
  competitionTeams,
  DB,
  eras,
  leagues,
  matches,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, ilike, sql } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class CompetitionUpsertConflictError extends UpsertConflictError {}

export interface CompetitionWithTeamEras extends Competition {
  teamEraIds: number[];
}

@Injectable()
export class CompetitionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  async upsert(
    data: UpsertCompetition,
  ): Promise<{ competition: CompetitionWithTeamEras; created: boolean }> {
    const { row: competition, created } = await upsertByExternalIds<
      typeof competitions,
      typeof competitionExternalIds
    >({
      db: this.db,
      entityTable: competitions,
      entityIdColumn: competitions.id,
      values: {
        name: data.name,
        type: data.type,
        eraId: data.eraId,
        startDate: data.startDate,
        endDate: data.endDate,
        competitionGroupId: data.competitionGroupId,
      },
      externalIdTable: competitionExternalIds,
      ownerIdColumn: competitionExternalIds.competitionId,
      externalSystemIdColumn: competitionExternalIds.externalSystemId,
      externalIdColumn: competitionExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: CompetitionUpsertConflictError,
      entityLabelPlural: 'competitions',
      buildExternalIdRow: (competitionId, pair) => ({ competitionId, ...pair }),
    });

    const teamEraIds = await this.syncTeamEras(competition.id, data.teamEraIds);
    return { competition: { ...competition, teamEraIds }, created };
  }

  /**
   * Resolve one external-id pair to the competition that already declares it.
   * The read-only half of what `upsert` does internally, exposed on its own
   * so a caller can reference a competition imported in an earlier run,
   * phase or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: competitionExternalIds,
      ownerIdColumn: competitionExternalIds.competitionId,
      externalSystemIdColumn: competitionExternalIds.externalSystemId,
      externalIdColumn: competitionExternalIds.externalId,
      externalIds,
    });
  }

  private async syncTeamEras(
    competitionId: number,
    teamEraIds: number[],
  ): Promise<number[]> {
    const existing = await this.db
      .select({ teamEraId: competitionTeams.teamEraId })
      .from(competitionTeams)
      .where(eq(competitionTeams.competitionId, competitionId));

    const existingIds = existing.map((r) => r.teamEraId);
    const existingSet = new Set(existingIds);
    const toInsert = teamEraIds.filter((id) => !existingSet.has(id));

    if (toInsert.length > 0) {
      await this.db
        .insert(competitionTeams)
        .values(toInsert.map((teamEraId) => ({ competitionId, teamEraId })));
    }

    return [...existingIds, ...toInsert];
  }

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
    type: 'season' | 'cup',
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

  async findById(
    id: number,
  ): Promise<
    | { id: number; name: string; type: 'season' | 'cup'; eraId: number }
    | undefined
  > {
    const rows = await this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
        eraId: competitions.eraId,
      })
      .from(competitions)
      .where(eq(competitions.id, id));
    return rows[0];
  }

  async findByIdWithEra(id: number): Promise<
    | {
        id: number;
        name: string;
        type: 'season' | 'cup';
        eraId: number;
        eraName: string;
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
        startDate: competitions.startDate,
        endDate: competitions.endDate,
      })
      .from(competitions)
      .innerJoin(eras, eq(eras.id, competitions.eraId))
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
      type: 'season' | 'cup';
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
   * Every competition with the era it belongs to. Unordered: the only caller
   * (the random-insights scheduler) picks one at random, so paying for a sort
   * would be wasted work.
   */
  listAllWithEraId(): Promise<{ id: number; name: string; eraId: number }[]> {
    return this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        eraId: competitions.eraId,
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
