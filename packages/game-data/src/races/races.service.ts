import type {
  ExternalId,
  ResolveResult,
  UpsertRace,
} from '@blood-bowl-tracker/api-contract';
import type { Race } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  eras,
  matches,
  matchTeams,
  raceEras,
  raceExternalIds,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, countDistinct, desc, eq, ilike } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { countMatchesWithOutcomeByRace } from '../shared/match-outcome-counts';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class RaceUpsertConflictError extends UpsertConflictError {}

export interface RaceWithEras extends Race {
  eras: number[];
}

@Injectable()
export class RacesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  async findById(
    id: number,
  ): Promise<{ id: number; name: string } | undefined> {
    const rows = await this.db
      .select({ id: races.id, name: races.name })
      .from(races)
      .where(eq(races.id, id));
    return rows[0];
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: races.id, name: races.name })
      .from(races)
      .where(ilike(races.name, `${this.likePattern.escape(prefix)}%`))
      .limit(limit);
  }

  async listEras(raceId: number): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: eras.id, name: eras.name })
      .from(raceEras)
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .where(eq(raceEras.raceId, raceId))
      .orderBy(eras.startDate, eras.name);
  }

  getTopTeamsByMatchesPlayed(
    raceId: number,
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
      .where(eq(teams.raceId, raceId))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(matches.id)))
      .limit(limit);
  }

  async upsert(
    data: UpsertRace,
  ): Promise<{ race: RaceWithEras; created: boolean }> {
    const { row: race, created } = await upsertByExternalIds<
      typeof races,
      typeof raceExternalIds
    >({
      db: this.db,
      entityTable: races,
      entityIdColumn: races.id,
      values: { name: data.name },
      externalIdTable: raceExternalIds,
      ownerIdColumn: raceExternalIds.raceId,
      externalSystemIdColumn: raceExternalIds.externalSystemId,
      externalIdColumn: raceExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: RaceUpsertConflictError,
      entityLabelPlural: 'races',
      buildExternalIdRow: (raceId, pair) => ({ raceId, ...pair }),
    });

    const eras = await this.syncEras(race.id, data.eras);
    return { race: { ...race, eras }, created };
  }

  /**
   * Resolve one external-id pair to the race that already declares it. The
   * read-only half of what `upsert` does internally, exposed on its own so a
   * caller can reference a race imported in an earlier run, phase or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: raceExternalIds,
      ownerIdColumn: raceExternalIds.raceId,
      externalSystemIdColumn: raceExternalIds.externalSystemId,
      externalIdColumn: raceExternalIds.externalId,
      externalIds,
    });
  }

  private async syncEras(raceId: number, eraIds: number[]): Promise<number[]> {
    const existing = await this.db
      .select({ eraId: raceEras.eraId })
      .from(raceEras)
      .where(eq(raceEras.raceId, raceId));

    const existingIds = existing.map((r) => r.eraId);
    const existingSet = new Set(existingIds);
    const toInsert = eraIds.filter((id) => !existingSet.has(id));

    if (toInsert.length > 0) {
      await this.db
        .insert(raceEras)
        .values(toInsert.map((eraId) => ({ raceId, eraId })));
    }

    return [...existingIds, ...toInsert];
  }

  async countTeamsByRace(
    scope: FactScope,
    limit: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    const base = this.db
      .select({
        raceId: races.id,
        name: races.name,
        count: countDistinct(teams.id),
      })
      .from(races)
      .innerJoin(teams, eq(teams.raceId, races.id));
    if (scope.leagueId !== undefined) {
      return base
        .innerJoin(teamEras, eq(teamEras.teamId, teams.id))
        .innerJoin(
          eras,
          and(eq(eras.id, teamEras.eraId), eq(eras.leagueId, scope.leagueId)),
        )
        .groupBy(races.id, races.name)
        .orderBy(desc(countDistinct(teams.id)))
        .limit(limit);
    }
    if (scope.eraId !== undefined) {
      return base
        .innerJoin(
          teamEras,
          and(eq(teamEras.teamId, teams.id), eq(teamEras.eraId, scope.eraId)),
        )
        .groupBy(races.id, races.name)
        .orderBy(desc(countDistinct(teams.id)))
        .limit(limit);
    }
    return base
      .groupBy(races.id, races.name)
      .orderBy(desc(countDistinct(teams.id)))
      .limit(limit);
  }

  async countMatchesPlayedByRace(
    scope: FactScope,
    limit: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    return (
      this.db
        .select({
          raceId: races.id,
          name: races.name,
          count: countDistinct(matchTeams.id),
        })
        .from(matchTeams)
        .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
        .innerJoin(eras, eq(eras.id, teamEras.eraId))
        .innerJoin(teams, eq(teams.id, teamEras.teamId))
        .innerJoin(races, eq(races.id, teams.raceId))
        // matchTeams.matchId is a non-null foreign key, so this join drops no
        // rows; it is unconditional (and last, keeping the earlier join indices
        // stable) purely to expose matches.category to the filter below.
        .innerJoin(matches, eq(matches.id, matchTeams.matchId))
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
        .groupBy(races.id, races.name)
        .orderBy(desc(countDistinct(matchTeams.id)))
        .limit(limit)
    );
  }

  /**
   * The won/lost/drawn siblings of `countMatchesPlayedByRace`. Like that
   * query these count one participation per participating team, so a drawn
   * match between two teams of the same race adds 2 to that race's total.
   * See shared/match-outcome-counts.ts.
   */
  countMatchesWonByRace(
    scope: FactScope,
    limit: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    return countMatchesWithOutcomeByRace({
      db: this.db,
      outcome: 'won',
      scope,
      limit,
    });
  }

  countMatchesLostByRace(
    scope: FactScope,
    limit: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    return countMatchesWithOutcomeByRace({
      db: this.db,
      outcome: 'lost',
      scope,
      limit,
    });
  }

  countMatchesDrawnByRace(
    scope: FactScope,
    limit: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    return countMatchesWithOutcomeByRace({
      db: this.db,
      outcome: 'drawn',
      scope,
      limit,
    });
  }

  countAll(): Promise<number> {
    return countRows(this.db, races);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(raceEras.raceId) })
      .from(raceEras)
      .where(eq(raceEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(raceEras.raceId) })
      .from(raceEras)
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.raceId) })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}
