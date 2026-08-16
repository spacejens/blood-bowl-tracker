import type {
  ExternalId,
  ResolveResult,
  UpsertPosition,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Position } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  DB,
  eras,
  positionExternalIds,
  positions,
  positionsRaceEras,
  raceEras,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, countDistinct, eq, inArray } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class PositionUpsertConflictError extends UpsertConflictError {}

export interface SyncPositionRaceErasData {
  positionId: number;
  raceEras: { raceId: number; eraId: number }[];
}

@Injectable()
export class PositionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertPosition,
  ): Promise<{ position: Position; created: boolean }> {
    const { row: position, created } = await upsertByExternalIds<
      typeof positions,
      typeof positionExternalIds
    >({
      db: this.db,
      entityTable: positions,
      entityIdColumn: positions.id,
      values: { name: data.name, isStarPlayer: data.isStarPlayer },
      externalIdTable: positionExternalIds,
      ownerIdColumn: positionExternalIds.positionId,
      externalSystemIdColumn: positionExternalIds.externalSystemId,
      externalIdColumn: positionExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: PositionUpsertConflictError,
      entityLabelPlural: 'positions',
      buildExternalIdRow: (positionId, pair) => ({ positionId, ...pair }),
    });

    return { position, created };
  }

  /**
   * Resolve one external-id pair to the position that already declares it.
   * The read-only half of what `upsert` does internally, exposed on its own
   * so a caller can reference a position imported in an earlier run, phase
   * or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: positionExternalIds,
      ownerIdColumn: positionExternalIds.positionId,
      externalSystemIdColumn: positionExternalIds.externalSystemId,
      externalIdColumn: positionExternalIds.externalId,
      externalIds,
    });
  }

  /**
   * Upsert-only: inserts any of `data.raceEras` not already present, but
   * never removes a previously persisted row. Availability evidence
   * accumulates and is never revoked by a later sync.
   */
  async syncRaceEras(
    data: SyncPositionRaceErasData,
  ): Promise<{ positionId: number; raceEraIds: number[] }> {
    if (data.raceEras.length === 0) {
      return { positionId: data.positionId, raceEraIds: [] };
    }

    const raceIds = [...new Set(data.raceEras.map((re) => re.raceId))];
    const raceEraRows = await this.db
      .select({
        id: raceEras.id,
        raceId: raceEras.raceId,
        eraId: raceEras.eraId,
      })
      .from(raceEras)
      .where(inArray(raceEras.raceId, raceIds));

    const idByKey = new Map(
      raceEraRows.map((r) => [`${r.raceId}:${r.eraId}`, r.id]),
    );

    const resolvedIds: number[] = [];
    for (const re of data.raceEras) {
      const id = idByKey.get(`${re.raceId}:${re.eraId}`);
      if (id !== undefined) {
        resolvedIds.push(id);
      }
    }
    const raceEraIds = [...new Set(resolvedIds)];

    if (raceEraIds.length > 0) {
      const existing = await this.db
        .select({ raceEraId: positionsRaceEras.raceEraId })
        .from(positionsRaceEras)
        .where(eq(positionsRaceEras.positionId, data.positionId));
      const existingIds = new Set(existing.map((r) => r.raceEraId));
      const toInsert = raceEraIds.filter((id) => !existingIds.has(id));
      if (toInsert.length > 0) {
        await this.db.insert(positionsRaceEras).values(
          toInsert.map((raceEraId) => ({
            positionId: data.positionId,
            raceEraId,
          })),
        );
      }
    }

    return { positionId: data.positionId, raceEraIds };
  }

  countAll(): Promise<number> {
    return countRows(this.db, positions);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionsRaceEras.positionId) })
      .from(positionsRaceEras)
      .innerJoin(raceEras, eq(raceEras.id, positionsRaceEras.raceEraId))
      .where(eq(raceEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionsRaceEras.positionId) })
      .from(positionsRaceEras)
      .innerJoin(raceEras, eq(raceEras.id, positionsRaceEras.raceEraId))
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionsRaceEras.positionId) })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(
        raceEras,
        and(
          eq(raceEras.raceId, teams.raceId),
          eq(raceEras.eraId, teamEras.eraId),
        ),
      )
      .innerJoin(
        positionsRaceEras,
        eq(positionsRaceEras.raceEraId, raceEras.id),
      )
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}
